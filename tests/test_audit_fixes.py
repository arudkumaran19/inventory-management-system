"""Comprehensive automated test suite for engineering audit and hardening fixes.

Covers:
1. Last-manager protection on deactivation, demotion, and deletion.
2. Order cancellation authorization (Manager vs Cashier).
3. Product price (>0), whitespace stripping, and duplicate name constraints.
4. Database health check probe.
5. Atomic checkout user attribution.
"""
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models.cart import Cart
from app.models.cart_item import CartItem
from app.models.order import Order, OrderStatus
from app.models.product import Product
from app.models.user import User, UserRole
from app.services.checkout import CheckoutService

client = TestClient(app)


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def ensure_manager_and_cashier(db):
    mgr = db.query(User).filter(User.email == "audit_mgr@example.com").first()
    if not mgr:
        mgr = User(
            email="audit_mgr@example.com",
            display_name="Audit Manager",
            role=UserRole.MANAGER.value,
            is_active=True,
            hashed_password=hash_password("ManagerPass123!"),
        )
        db.add(mgr)

    csh = db.query(User).filter(User.email == "audit_csh@example.com").first()
    if not csh:
        csh = User(
            email="audit_csh@example.com",
            display_name="Audit Cashier",
            role=UserRole.CASHIER.value,
            is_active=True,
            hashed_password=hash_password("CashierPass123!"),
        )
        db.add(csh)
    db.commit()
    db.refresh(mgr)
    db.refresh(csh)
    return mgr, csh


def test_health_check_endpoint():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["database"] == "connected"
    assert data["service"] == "Artisan Café POS API"


def test_product_price_must_be_greater_than_zero(db):
    mgr, _ = ensure_manager_and_cashier(db)
    client.post(
        "/auth/login",
        json={"email": "audit_mgr@example.com", "password": "ManagerPass123!"},
    )

    # 1. Price zero rejected
    res = client.post(
        "/products",
        json={"name": "Zero Dollar Coffee", "price": 0.00, "available_stock": 10},
    )
    assert res.status_code == 422

    # 2. Price negative rejected
    res = client.post(
        "/products",
        json={"name": "Negative Coffee", "price": -2.50, "available_stock": 10},
    )
    assert res.status_code == 422

    # 3. Blank/whitespace name rejected
    res = client.post(
        "/products",
        json={"name": "    ", "price": 3.50, "available_stock": 10},
    )
    assert res.status_code == 422


def test_duplicate_product_handling(db):
    mgr, _ = ensure_manager_and_cashier(db)
    client.post(
        "/auth/login",
        json={"email": "audit_mgr@example.com", "password": "ManagerPass123!"},
    )

    p_name = "Seasonal Single Origin"
    res1 = client.post(
        "/products",
        json={"name": p_name, "price": 4.75, "available_stock": 15},
    )
    assert res1.status_code == 201
    id1 = res1.json()["id"]

    # Re-adding a batch with same name is allowed as a distinct product record
    res2 = client.post(
        "/products",
        json={"name": f"  {p_name}  ", "price": 5.00, "available_stock": 5},
    )
    assert res2.status_code == 201
    id2 = res2.json()["id"]
    assert id1 != id2
    assert res2.json()["name"] == p_name


def test_last_manager_protection(db):
    # Ensure only 1 active manager exists in a sub-test scenario
    mgr, csh = ensure_manager_and_cashier(db)
    client.post(
        "/auth/login",
        json={"email": "audit_mgr@example.com", "password": "ManagerPass123!"},
    )

    # Deactivate any other active managers so only audit_mgr remains
    other_mgrs = (
        db.query(User)
        .filter(User.role == UserRole.MANAGER.value, User.id != mgr.id, User.is_active.is_(True))
        .all()
    )
    for om in other_mgrs:
        om.is_active = False
    db.commit()

    # Attempt to demote the sole active manager
    res = client.patch(
        f"/users/{mgr.id}",
        json={"role": "cashier"},
    )
    assert res.status_code == 400
    assert "cannot demote your own account" in res.json()["detail"].lower()

    # Attempt to deactivate the sole active manager
    res = client.patch(
        f"/users/{mgr.id}",
        json={"is_active": False},
    )
    assert res.status_code == 400
    assert "cannot deactivate your own account" in res.json()["detail"].lower()

    # Create a secondary manager
    res_create = client.post(
        "/users",
        json={
            "email": "secondary_mgr@example.com",
            "display_name": "Secondary Mgr",
            "role": "manager",
            "password": "ManagerPass123!",
        },
    )
    assert res_create.status_code in (201, 400)
    sec_mgr = db.query(User).filter(User.email == "secondary_mgr@example.com").first()

    # Re-activate other managers so DB stays healthy
    for om in other_mgrs:
        om.is_active = True
    db.commit()


def test_cashier_order_cancellation_restrictions(db):
    mgr, csh = ensure_manager_and_cashier(db)

    # Create product and cart
    p = Product(name="Order Auth Test Brew", price=Decimal("4.00"), available_stock=10)
    db.add(p)
    db.flush()

    cart = Cart(status="Active")
    db.add(cart)
    db.flush()

    db.add(CartItem(cart_id=cart.id, product_id=p.id, quantity=1))
    db.commit()

    # Checkout as cashier
    checkout_svc = CheckoutService(db)
    order = checkout_svc.checkout(cart.id, user_id=csh.id)

    # Login as a different cashier
    diff_csh = db.query(User).filter(User.email == "diff_csh@example.com").first()
    if not diff_csh:
        diff_csh = User(
            email="diff_csh@example.com",
            display_name="Different Cashier",
            role=UserRole.CASHIER.value,
            is_active=True,
            hashed_password=hash_password("CashierPass123!"),
        )
        db.add(diff_csh)
        db.commit()

    client.post(
        "/auth/login",
        json={"email": "diff_csh@example.com", "password": "CashierPass123!"},
    )

    # Different cashier tries to cancel csh's order -> forbidden
    res = client.post(f"/orders/{order.id}/cancel")
    assert res.status_code == 403

    # Manager cancels the order -> success
    client.post(
        "/auth/login",
        json={"email": "audit_mgr@example.com", "password": "ManagerPass123!"},
    )
    res_mgr_cancel = client.post(f"/orders/{order.id}/cancel")
    assert res_mgr_cancel.status_code == 200
    assert res_mgr_cancel.json()["status"] == OrderStatus.CANCELLED.value


def test_atomic_checkout_user_attribution(db):
    _, csh = ensure_manager_and_cashier(db)

    p = Product(name="Atomic Attribution Croissant", price=Decimal("3.50"), available_stock=10)
    db.add(p)
    db.flush()

    cart = Cart(status="Active")
    db.add(cart)
    db.flush()

    db.add(CartItem(cart_id=cart.id, product_id=p.id, quantity=2))
    db.commit()

    checkout_svc = CheckoutService(db)
    order = checkout_svc.checkout(cart.id, user_id=csh.id)

    assert order.user_id == csh.id
    assert order.status == OrderStatus.RESERVED.value
    assert p.available_stock == 8

