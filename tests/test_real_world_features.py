from decimal import Decimal
import io
import csv
import pytest
from fastapi.testclient import TestClient

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models.cart import Cart
from app.models.payment import PaymentMethod, PaymentStatus
from app.models.product import Product
from app.models.user import User, UserRole
from app.services.checkout import CheckoutService
from app.services.payment import PaymentOutcome, PaymentService


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def ensure_users(db):
    mgr = db.query(User).filter(User.email == "rw_mgr@example.com").first()
    if not mgr:
        mgr = User(
            email="rw_mgr@example.com",
            display_name="RW Manager",
            role=UserRole.MANAGER.value,
            is_active=True,
            hashed_password=hash_password("ManagerPass123!"),
        )
        db.add(mgr)

    csh = db.query(User).filter(User.email == "rw_csh@example.com").first()
    if not csh:
        csh = User(
            email="rw_csh@example.com",
            display_name="RW Cashier",
            role=UserRole.CASHIER.value,
            is_active=True,
            hashed_password=hash_password("CashierPass123!"),
        )
        db.add(csh)
    db.commit()
    db.refresh(mgr)
    db.refresh(csh)
    return mgr, csh


def get_authenticated_client(role: str, db):
    ensure_users(db)
    client = TestClient(app)
    if role == "manager":
        client.post("/auth/login", json={"email": "rw_mgr@example.com", "password": "ManagerPass123!"})
    else:
        client.post("/auth/login", json={"email": "rw_csh@example.com", "password": "CashierPass123!"})
    return client


def test_cash_payment_and_change_due(db):
    """Verify cash payment records amount tendered and change due."""
    p = Product(name="Cash Test Pastry", price=Decimal("4.50"), available_stock=10, category="Bakery")
    db.add(p)
    db.flush()

    cart = Cart(status="Active")
    db.add(cart)
    db.flush()

    from app.models.cart_item import CartItem
    db.add(CartItem(cart_id=cart.id, product_id=p.id, quantity=2))  # total $9.00
    db.commit()

    checkout_svc = CheckoutService(db)
    order = checkout_svc.checkout(cart.id)

    payment_svc = PaymentService(db)
    payment = payment_svc.process_payment(
        order_id=order.id,
        idempotency_key=f"cash-key-{order.id}",
        outcome=PaymentOutcome.SUCCESS,
        method=PaymentMethod.CASH.value,
        amount_tendered=Decimal("20.00"),
        change_due=Decimal("11.00"),
    )

    assert payment.status == PaymentStatus.SUCCEEDED.value
    assert payment.method == "cash"
    assert payment.amount_tendered == Decimal("20.00")
    assert payment.change_due == Decimal("11.00")


def test_card_payment_with_reference_id(db):
    """Verify card payment records reference ID."""
    p = Product(name="Card Test Latte", price=Decimal("5.25"), available_stock=10, category="Coffee")
    db.add(p)
    db.flush()

    cart = Cart(status="Active")
    db.add(cart)
    db.flush()

    from app.models.cart_item import CartItem
    db.add(CartItem(cart_id=cart.id, product_id=p.id, quantity=1))
    db.commit()

    checkout_svc = CheckoutService(db)
    order = checkout_svc.checkout(cart.id)

    payment_svc = PaymentService(db)
    payment = payment_svc.process_payment(
        order_id=order.id,
        idempotency_key=f"card-key-{order.id}",
        outcome=PaymentOutcome.SUCCESS,
        method=PaymentMethod.CARD.value,
        reference_id="AUTH-998822",
    )

    assert payment.status == PaymentStatus.SUCCEEDED.value
    assert payment.method == "card"
    assert payment.reference_id == "AUTH-998822"


def test_inventory_log_on_stock_adjustment(db):
    """Verify inventory log records adjustment reason and user attribution."""
    client = get_authenticated_client("manager", db)
    p = Product(name="Audit Stock Tea", price=Decimal("3.00"), available_stock=10, category="Tea")
    db.add(p)
    db.commit()
    pid = p.id

    resp = client.patch(
        f"/products/{pid}",
        json={"available_stock": 15, "adjustment_reason": "Supplier Delivery Batch #44"},
    )
    assert resp.status_code == 200
    assert resp.json()["available_stock"] == 15

    logs_resp = client.get("/products/inventory/logs")
    assert logs_resp.status_code == 200
    logs = logs_resp.json()
    matching = [l for l in logs if l["product_id"] == pid]
    assert len(matching) >= 1
    assert matching[0]["previous_stock"] == 10
    assert matching[0]["new_stock"] == 15
    assert matching[0]["change_amount"] == 5
    assert matching[0]["reason"] == "Supplier Delivery Batch #44"


def test_cart_park_and_resume(db):
    """Verify cashier can park an active order and resume it later."""
    client = get_authenticated_client("cashier", db)
    p = Product(name="Park Test Espresso", price=Decimal("3.50"), available_stock=10, category="Coffee")
    db.add(p)
    db.commit()

    # Create cart and add item
    cart_resp = client.post("/carts", json={})
    cart_id = cart_resp.json()["id"]

    client.post(
        f"/carts/{cart_id}/items",
        json={"product_id": p.id, "quantity": 1, "notes": "Oat milk"},
    )

    # Park cart
    park_resp = client.post(
        f"/carts/{cart_id}/park",
        json={"label": "Table 4 - Alice"},
    )
    assert park_resp.status_code == 200
    assert park_resp.json()["status"] == "Parked"
    assert park_resp.json()["label"] == "Table 4 - Alice"

    # List parked carts
    parked_list = client.get("/carts/parked").json()
    assert any(c["id"] == cart_id for c in parked_list)

    # Resume cart
    resume_resp = client.post(f"/carts/{cart_id}/resume")
    assert resume_resp.status_code == 200
    assert resume_resp.json()["status"] == "Active"


def test_shift_management_lifecycle(db):
    """Verify open shift, X-Report summary, and close shift with Z-Report."""
    client = get_authenticated_client("cashier", db)
    # Check if shift is currently open; if so close it
    curr = client.get("/shifts/current").json()
    if curr is not None:
        client.post(
            f"/shifts/{curr['shift']['id']}/close",
            json={"closing_cash_actual": 200.0, "notes": "Reset for test"},
        )

    # Open fresh shift
    open_resp = client.post(
        "/shifts/open",
        json={"opening_float": 150.00},
    )
    assert open_resp.status_code == 201
    shift_id = open_resp.json()["id"]
    assert float(open_resp.json()["opening_float"]) == 150.00

    # Get mid-shift summary (X-Report)
    mid_summary = client.get("/shifts/current")
    assert mid_summary.status_code == 200
    data = mid_summary.json()
    assert data["shift"]["id"] == shift_id
    assert float(data["expected_cash"]) >= 150.00

    # Close shift with count (Z-Report)
    close_resp = client.post(
        f"/shifts/{shift_id}/close",
        json={"closing_cash_actual": 155.00, "notes": "Shift reconciled perfectly"},
    )
    assert close_resp.status_code == 200
    closed_data = close_resp.json()
    assert closed_data["shift"]["status"] == "Closed"
    assert float(closed_data["shift"]["closing_cash_actual"]) == 155.00


def test_order_analytics_and_csv_export(db):
    """Verify order analytics and CSV export for bookkeeping."""
    client = get_authenticated_client("manager", db)
    analytics_resp = client.get("/orders/analytics/summary")
    assert analytics_resp.status_code == 200
    summary = analytics_resp.json()
    assert "gross_sales" in summary
    assert "net_sales" in summary
    assert "top_products" in summary

    csv_resp = client.get("/orders/export/csv")
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers["content-type"]
    reader = csv.reader(io.StringIO(csv_resp.text))
    header = next(reader)
    assert "Order ID" in header
    assert "Payment Method" in header
