"""Adversarial concurrency test suite for Artisan Café POS.

Verifies:
1. Two concurrent attempts to demote the final managers (barrier sync).
2. Concurrent purchases of the final stock unit (barrier sync).
3. Concurrent payment requests with the same idempotency key (barrier sync).
4. Concurrent payment requests with different keys (barrier sync).
5. Simultaneous reservation expiry processing (barrier sync).
6. Duplicate cancellation requests (barrier sync).
7. Duplicate refund attempts.
"""
import uuid
from decimal import Decimal
import threading
from fastapi import HTTPException
import pytest

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.cart import Cart
from app.models.cart_item import CartItem
from app.models.order import Order, OrderStatus
from app.models.payment import PaymentStatus
from app.models.product import Product
from app.models.reservation import Reservation, ReservationStatus
from app.models.user import User, UserRole
from app.services.checkout import CheckoutService
from app.services.expiry import ReservationExpiryService
from app.services.order import OrderService
from app.services.payment import PaymentOutcome, PaymentService


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def test_concurrent_demote_final_managers_barrier():
    """Verify that two concurrent demotions of the only two active managers cannot leave zero managers."""
    from sqlalchemy import select

    test_uid = uuid.uuid4().hex[:6]
    m1_email = f"conc_mgr1_{test_uid}@example.com"
    m2_email = f"conc_mgr2_{test_uid}@example.com"

    db_setup = SessionLocal()
    disabled_mgr_ids = []
    try:
        # Clean any old test records if present
        old_test_users = db_setup.scalars(select(User).where(User.email.like("conc_mgr%"))).all()
        for u in old_test_users:
            db_setup.delete(u)
        db_setup.commit()

        # Temporarily deactivate background managers so that exactly 2 active managers exist in the system
        existing_active = db_setup.scalars(
            select(User).where(User.role == UserRole.MANAGER.value, User.is_active.is_(True))
        ).all()
        for mgr in existing_active:
            mgr.is_active = False
            disabled_mgr_ids.append(mgr.id)

        # Create our two test managers
        m1 = User(
            email=m1_email,
            display_name="Conc Manager 1",
            role=UserRole.MANAGER.value,
            is_active=True,
            hashed_password=hash_password("ManagerPass123!"),
        )
        m2 = User(
            email=m2_email,
            display_name="Conc Manager 2",
            role=UserRole.MANAGER.value,
            is_active=True,
            hashed_password=hash_password("ManagerPass123!"),
        )
        db_setup.add_all([m1, m2])
        db_setup.commit()
        m1_id, m2_id = m1.id, m2.id
    finally:
        db_setup.close()

    barrier = threading.Barrier(2)
    results = []

    def demote_worker(target_id):
        worker_db = SessionLocal()
        try:
            barrier.wait()
            # Simulate PATCH /users/{id} logic with row locking
            active_managers = (
                worker_db.scalars(
                    select(User)
                    .where(
                        User.role == UserRole.MANAGER.value,
                        User.is_active.is_(True),
                    )
                    .order_by(User.id.asc())
                    .with_for_update()
                )
                .all()
            )
            if len(active_managers) <= 1:
                results.append({"success": False, "error": "Cannot demote last manager"})
                worker_db.rollback()
                return

            target = worker_db.get(User, target_id)
            target.role = UserRole.CASHIER.value
            worker_db.commit()
            results.append({"success": True, "target_id": target_id})
        except Exception as e:
            worker_db.rollback()
            results.append({"success": False, "error": str(e)})
        finally:
            worker_db.close()

    try:
        t1 = threading.Thread(target=demote_worker, args=(m1_id,))
        t2 = threading.Thread(target=demote_worker, args=(m2_id,))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        # Verify results: Exactly one demotion succeeded, one was rejected!
        success_count = sum(1 for r in results if r["success"])
        fail_count = sum(1 for r in results if not r["success"])
        assert success_count == 1, f"Expected exactly 1 success, got {results}"
        assert fail_count == 1, f"Expected exactly 1 failure, got {results}"

        # Verify database state: exactly 1 manager remains
        verify_db = SessionLocal()
        try:
            m1_row = verify_db.get(User, m1_id)
            m2_row = verify_db.get(User, m2_id)
            roles = [m1_row.role, m2_row.role]
            assert UserRole.MANAGER.value in roles, "CRITICAL: Zero managers remained!"
            assert UserRole.CASHIER.value in roles
        finally:
            verify_db.close()
    finally:
        # Tear down and restore background managers
        cleanup_db = SessionLocal()
        try:
            r1 = cleanup_db.get(User, m1_id)
            if r1:
                cleanup_db.delete(r1)
            r2 = cleanup_db.get(User, m2_id)
            if r2:
                cleanup_db.delete(r2)
            for mid in disabled_mgr_ids:
                u = cleanup_db.get(User, mid)
                if u:
                    u.is_active = True
            cleanup_db.commit()
        finally:
            cleanup_db.close()


def test_concurrent_purchases_of_final_unit_barrier():
    """Verify that two concurrent purchases of the final available unit result in exactly 1 order and 0 overselling."""
    setup_db = SessionLocal()
    try:
        p = Product(name="Final Unit Specialty Roast", price=Decimal("15.00"), available_stock=1)
        setup_db.add(p)
        setup_db.flush()

        cart1 = Cart(status="Active")
        cart2 = Cart(status="Active")
        setup_db.add_all([cart1, cart2])
        setup_db.flush()

        setup_db.add_all([
            CartItem(cart_id=cart1.id, product_id=p.id, quantity=1),
            CartItem(cart_id=cart2.id, product_id=p.id, quantity=1),
        ])
        setup_db.commit()
        pid, c1_id, c2_id = p.id, cart1.id, cart2.id
    finally:
        setup_db.close()

    barrier = threading.Barrier(2)
    results = []

    def checkout_worker(cart_id):
        worker_db = SessionLocal()
        try:
            barrier.wait()
            svc = CheckoutService(worker_db)
            order = svc.checkout(cart_id)
            results.append({"success": True, "order_id": order.id, "cart_id": cart_id})
        except HTTPException as exc:
            worker_db.rollback()
            results.append({"success": False, "status_code": exc.status_code, "detail": exc.detail})
        except Exception as exc:
            worker_db.rollback()
            results.append({"success": False, "error": str(exc)})
        finally:
            worker_db.close()

    t1 = threading.Thread(target=checkout_worker, args=(c1_id,))
    t2 = threading.Thread(target=checkout_worker, args=(c2_id,))
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    successes = [r for r in results if r["success"]]
    failures = [r for r in results if not r["success"]]

    assert len(successes) == 1, f"Expected 1 successful checkout, got {results}"
    assert len(failures) == 1, f"Expected 1 failed checkout, got {results}"
    assert failures[0].get("status_code") == 409

    verify_db = SessionLocal()
    try:
        p_row = verify_db.get(Product, pid)
        assert p_row.available_stock == 0, f"Stock must be exactly 0, got {p_row.available_stock}"
    finally:
        verify_db.close()


def test_concurrent_payments_same_idempotency_key_barrier():
    """Verify that two simultaneous payments with identical idempotency key resolve idempotently without double-charging."""
    setup_db = SessionLocal()
    try:
        p = Product(name="Idempotent Key Brew", price=Decimal("6.00"), available_stock=5)
        setup_db.add(p)
        setup_db.flush()

        cart = Cart(status="Active")
        setup_db.add(cart)
        setup_db.flush()

        setup_db.add(CartItem(cart_id=cart.id, product_id=p.id, quantity=1))
        setup_db.commit()

        checkout_svc = CheckoutService(setup_db)
        order = checkout_svc.checkout(cart.id)
        oid = order.id
    finally:
        setup_db.close()

    key = f"concurrent-same-key-{oid}"
    barrier = threading.Barrier(2)
    results = []

    def payment_worker():
        worker_db = SessionLocal()
        try:
            barrier.wait()
            svc = PaymentService(worker_db)
            pmt = svc.process_payment(oid, idempotency_key=key, outcome=PaymentOutcome.SUCCESS)
            results.append({"success": True, "payment_id": pmt.id, "status": pmt.status})
        except Exception as exc:
            worker_db.rollback()
            results.append({"success": False, "error": str(exc)})
        finally:
            worker_db.close()

    t1 = threading.Thread(target=payment_worker)
    t2 = threading.Thread(target=payment_worker)
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    # Both workers should successfully resolve the same payment
    assert len(results) == 2
    for r in results:
        assert r["success"] is True
        assert r["status"] == PaymentStatus.SUCCEEDED.value

    # Verify exactly 1 payment record in DB
    verify_db = SessionLocal()
    try:
        from app.models.payment import Payment
        pmts = verify_db.query(Payment).filter(Payment.order_id == oid).all()
        assert len(pmts) == 1
        assert pmts[0].idempotency_key == key
    finally:
        verify_db.close()


def test_concurrent_payments_different_keys_barrier():
    """Verify that two simultaneous payments with different keys reject one with HTTP 409 conflict."""
    setup_db = SessionLocal()
    try:
        p = Product(name="Diff Key Brew", price=Decimal("6.00"), available_stock=5)
        setup_db.add(p)
        setup_db.flush()

        cart = Cart(status="Active")
        setup_db.add(cart)
        setup_db.flush()

        setup_db.add(CartItem(cart_id=cart.id, product_id=p.id, quantity=1))
        setup_db.commit()

        checkout_svc = CheckoutService(setup_db)
        order = checkout_svc.checkout(cart.id)
        oid = order.id
    finally:
        setup_db.close()

    barrier = threading.Barrier(2)
    results = []

    def payment_worker(k):
        worker_db = SessionLocal()
        try:
            barrier.wait()
            svc = PaymentService(worker_db)
            pmt = svc.process_payment(oid, idempotency_key=k, outcome=PaymentOutcome.SUCCESS)
            results.append({"success": True, "payment_id": pmt.id})
        except HTTPException as exc:
            worker_db.rollback()
            results.append({"success": False, "status_code": exc.status_code})
        except Exception as exc:
            worker_db.rollback()
            results.append({"success": False, "error": str(exc)})
        finally:
            worker_db.close()

    t1 = threading.Thread(target=payment_worker, args=(f"key-A-{oid}",))
    t2 = threading.Thread(target=payment_worker, args=(f"key-B-{oid}",))
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    successes = [r for r in results if r["success"]]
    conflicts = [r for r in results if not r["success"] and r.get("status_code") == 409]
    assert len(successes) == 1, f"Expected 1 success, got {results}"
    assert len(conflicts) == 1, f"Expected 1 conflict, got {results}"


def test_simultaneous_reservation_expiry_workers():
    """Verify skip_locked prevents race conditions when two expiry workers run simultaneously."""
    setup_db = SessionLocal()
    try:
        # Clean up any leftover expired reservations from earlier tests before testing concurrency
        clean_svc = ReservationExpiryService(setup_db)
        clean_svc.expire_due_reservations()

        p = Product(name="Expiry Race Product", price=Decimal("4.50"), available_stock=5)
        setup_db.add(p)
        setup_db.flush()

        cart = Cart(status="Active")
        setup_db.add(cart)
        setup_db.flush()

        setup_db.add(CartItem(cart_id=cart.id, product_id=p.id, quantity=2))
        setup_db.commit()

        checkout_svc = CheckoutService(setup_db)
        order = checkout_svc.checkout(cart.id)

        # Force expires_at into the past
        from datetime import datetime, timedelta, timezone
        order.reservation.expires_at = datetime.now(timezone.utc) - timedelta(minutes=10)
        setup_db.commit()
        pid = p.id
    finally:
        setup_db.close()

    barrier = threading.Barrier(2)
    counts = []

    def expiry_worker():
        worker_db = SessionLocal()
        try:
            barrier.wait()
            svc = ReservationExpiryService(worker_db)
            expired = svc.expire_due_reservations()
            counts.append(expired)
        finally:
            worker_db.close()

    t1 = threading.Thread(target=expiry_worker)
    t2 = threading.Thread(target=expiry_worker)
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    # Total expired count across both threads must be exactly 1
    assert sum(counts) == 1, f"Expected exactly 1 total expiration, got {counts}"

    # Stock must have been restored by exactly 2 (5 total)
    verify_db = SessionLocal()
    try:
        p_row = verify_db.get(Product, pid)
        assert p_row.available_stock == 5
    finally:
        verify_db.close()


def test_concurrent_cancellations_barrier():
    """Verify that simultaneous duplicate cancellation requests restore stock only once and reject the second."""
    setup_db = SessionLocal()
    try:
        p = Product(name="Cancel Race Bean", price=Decimal("12.00"), available_stock=10)
        setup_db.add(p)
        setup_db.flush()

        cart = Cart(status="Active")
        setup_db.add(cart)
        setup_db.flush()

        setup_db.add(CartItem(cart_id=cart.id, product_id=p.id, quantity=3))
        setup_db.commit()

        checkout_svc = CheckoutService(setup_db)
        order = checkout_svc.checkout(cart.id)
        oid = order.id
        pid = p.id
    finally:
        setup_db.close()

    barrier = threading.Barrier(2)
    results = []

    def cancel_worker():
        worker_db = SessionLocal()
        try:
            barrier.wait()
            svc = OrderService(worker_db)
            o = svc.cancel_order(oid)
            results.append({"success": True, "status": o.status})
        except HTTPException as exc:
            worker_db.rollback()
            results.append({"success": False, "status_code": exc.status_code, "detail": exc.detail})
        except Exception as exc:
            worker_db.rollback()
            results.append({"success": False, "error": str(exc)})
        finally:
            worker_db.close()

    t1 = threading.Thread(target=cancel_worker)
    t2 = threading.Thread(target=cancel_worker)
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    successes = [r for r in results if r["success"]]
    conflicts = [r for r in results if not r["success"] and r.get("status_code") == 409]

    assert len(successes) == 1, f"Expected 1 cancel success, got {results}"
    assert len(conflicts) == 1, f"Expected 1 conflict (already cancelled), got {results}"

    # Stock was 10, checked out 3 (available was 7), cancelled should restore to exactly 10
    verify_db = SessionLocal()
    try:
        p_row = verify_db.get(Product, pid)
        assert p_row.available_stock == 10, f"Stock must be exactly 10, got {p_row.available_stock}"
    finally:
        verify_db.close()


def test_duplicate_refund_attempt_rejected():
    """Verify that a paid order once cancelled and refunded cannot be cancelled again."""
    db = SessionLocal()
    try:
        p = Product(name="Refund Brew", price=Decimal("5.00"), available_stock=10)
        db.add(p)
        db.flush()

        cart = Cart(status="Active")
        db.add(cart)
        db.flush()

        db.add(CartItem(cart_id=cart.id, product_id=p.id, quantity=1))
        db.commit()

        checkout_svc = CheckoutService(db)
        order = checkout_svc.checkout(cart.id)

        pay_svc = PaymentService(db)
        pay_svc.process_payment(order.id, idempotency_key=f"refund-key-{order.id}", outcome=PaymentOutcome.SUCCESS)

        order_svc = OrderService(db)
        # First cancellation -> returns stock and marks payment Refunded
        cancelled = order_svc.cancel_order(order.id)
        assert cancelled.status == OrderStatus.CANCELLED.value
        assert cancelled.payment.status == PaymentStatus.REFUNDED.value

        # Second cancellation attempt -> must raise 409 Conflict
        with pytest.raises(HTTPException) as exc_info:
            order_svc.cancel_order(order.id)
        assert exc_info.value.status_code == 409
        assert "cannot be cancelled from status Cancelled" in exc_info.value.detail
    finally:
        db.close()
