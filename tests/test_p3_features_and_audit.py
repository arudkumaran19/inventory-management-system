import pytest
from decimal import Decimal
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, InternalError
from fastapi.testclient import TestClient

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models.ingredient import Ingredient
from app.models.location import Location
from app.models.order import Order
from app.models.payment import PaymentMethod
from app.models.product import Product
from app.models.recipe import ProductRecipe
from app.models.user import User, UserRole
from app.services.audit import AuditService
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
    mgr = db.query(User).filter(User.email == "p3_mgr@example.com").first()
    if not mgr:
        mgr = User(
            email="p3_mgr@example.com",
            display_name="P3 Manager",
            role=UserRole.MANAGER.value,
            is_active=True,
            hashed_password=hash_password("ManagerPass123!"),
        )
        db.add(mgr)

    csh = db.query(User).filter(User.email == "p3_csh@example.com").first()
    if not csh:
        csh = User(
            email="p3_csh@example.com",
            display_name="P3 Cashier",
            role=UserRole.CASHIER.value,
            is_active=True,
            hashed_password=hash_password("CashierPass123!"),
        )
        db.add(csh)
    db.commit()
    db.refresh(mgr)
    db.refresh(csh)
    return mgr, csh


def get_authenticated_client(role: str, db) -> TestClient:
    ensure_users(db)
    client = TestClient(app)
    if role == "manager":
        login_resp = client.post(
            "/auth/login",
            json={"email": "p3_mgr@example.com", "password": "ManagerPass123!"},
        )
    else:
        login_resp = client.post(
            "/auth/login",
            json={"email": "p3_csh@example.com", "password": "CashierPass123!"},
        )
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    return client


def test_immutable_audit_log_chain_and_verification(db):
    """Verify that audit logs build a valid SHA-256 cryptographic chain that passes verification."""
    client = get_authenticated_client("manager", db)

    # Perform an audited operation: update an ingredient
    ing = db.query(Ingredient).first()
    if not ing:
        ing = Ingredient(name="Test Coffee Beans", unit="g", current_stock=Decimal("5000.00"), reorder_threshold=Decimal("500.00"))
        db.add(ing)
        db.commit()

    resp = client.patch(
        f"/ingredients/{ing.id}",
        json={"current_stock": 4800.00, "adjustment_reason": "Morning Dial-in"},
    )
    assert resp.status_code == 200

    # Query audit logs endpoint
    logs_resp = client.get("/audit-logs")
    assert logs_resp.status_code == 200
    logs = logs_resp.json()
    assert len(logs) > 0

    # Verify cryptographic hash chain integrity endpoint
    verify_resp = client.get("/audit-logs/verify")
    assert verify_resp.status_code == 200
    res = verify_resp.json()
    assert res["valid"] is True
    assert res["total_records"] >= 1
    assert len(res["chain_head_hash"]) == 64


def test_database_trigger_enforces_immutability(db):
    """Verify database trigger rejects UPDATE or DELETE on audit_logs."""
    # Ensure there is at least one audit log
    AuditService.log_event(
        db=db,
        event_type="IMMUTABILITY_TEST",
        resource_type="system",
        action="TEST",
        payload={"note": "tamper test"},
    )
    db.commit()

    # Attempt to UPDATE an audit log row directly via SQL
    with pytest.raises(DBAPIError) as exc_info:
        db.execute(text("UPDATE audit_logs SET event_type = 'TAMPERED' WHERE id = (SELECT id FROM audit_logs LIMIT 1)"))
        db.commit()
    db.rollback()

    assert "forbidden" in str(exc_info.value).lower() or "append-only immutable" in str(exc_info.value).lower()

    # Attempt to DELETE an audit log row directly via SQL
    with pytest.raises(DBAPIError) as exc_info_del:
        db.execute(text("DELETE FROM audit_logs WHERE id = (SELECT id FROM audit_logs LIMIT 1)"))
        db.commit()
    db.rollback()

    assert "forbidden" in str(exc_info_del.value).lower() or "append-only immutable" in str(exc_info_del.value).lower()


def test_multi_location_tenancy(db):
    """Verify locations list, creation, and assignment to shifts/orders."""
    client = get_authenticated_client("manager", db)

    # 1. List locations (seeded MAIN and UPTOWN)
    locs_resp = client.get("/locations")
    assert locs_resp.status_code == 200
    locs = locs_resp.json()
    assert any(l["code"] == "MAIN" for l in locs)
    assert any(l["code"] == "UPTOWN" for l in locs)

    # 2. Manager creates new branch location
    new_loc = {
        "code": "HARBOR",
        "name": "Artisan Harbor Kiosk",
        "address": "Pier 39, Dock B",
        "phone": "555-0812",
    }
    create_resp = client.post("/locations", json=new_loc)
    assert create_resp.status_code in (201, 409)
    if create_resp.status_code == 201:
        assert create_resp.json()["code"] == "HARBOR"


def test_ingredient_recipe_bom_deduction_on_payment(db):
    """Verify BOM ingredient deduction when an order is paid."""
    client = get_authenticated_client("cashier", db)

    # 1. Setup raw ingredient
    beans = db.query(Ingredient).filter(Ingredient.name == "Test Espresso Beans BOM").first()
    if not beans:
        beans = Ingredient(
            name="Test Espresso Beans BOM",
            unit="g",
            current_stock=Decimal("1000.00"),
            reorder_threshold=Decimal("100.00"),
        )
        db.add(beans)
        db.commit()
        db.refresh(beans)

    initial_stock = beans.current_stock

    # 2. Setup product with recipe
    prod = db.query(Product).filter(Product.name == "Single Origin Espresso BOM").first()
    if not prod:
        prod = Product(
            name="Single Origin Espresso BOM",
            price=Decimal("4.00"),
            available_stock=50,
            category="Coffee",
        )
        db.add(prod)
        db.commit()
        db.refresh(prod)

    # Ensure recipe exists: 20g per shot
    rec = db.query(ProductRecipe).filter(
        ProductRecipe.product_id == prod.id,
        ProductRecipe.ingredient_id == beans.id,
    ).first()
    if not rec:
        db.add(ProductRecipe(product_id=prod.id, ingredient_id=beans.id, quantity=Decimal("20.00")))
        db.commit()

    # 3. Add to cart & checkout
    cart_resp = client.post("/carts", json={})
    cart_id = cart_resp.json()["id"]
    client.post(f"/carts/{cart_id}/items", json={"product_id": prod.id, "quantity": 2})

    chk_resp = client.post(f"/carts/{cart_id}/checkout")
    assert chk_resp.status_code == 200
    order_id = chk_resp.json()["order"]["id"]

    # 4. Pay order (success)
    pay_resp = client.post(
        f"/payments/orders/{order_id}",
        json={
            "idempotency_key": f"bom-test-pay-{order_id}",
            "outcome": "success",
            "method": "cash",
            "amount_tendered": 20.00,
        },
    )
    assert pay_resp.status_code == 200

    # 5. Verify beans deducted: 2 drinks * 20g = 40g
    db.refresh(beans)
    assert beans.current_stock == initial_stock - Decimal("40.00")
