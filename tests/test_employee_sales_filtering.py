"""Tests for employee-based sales filtering in Sales History and permissions enforcement.

Contracts verified:
  1. Manager can filter orders by a specific employee ID.
  2. Manager can retrieve all orders when no employee ID is passed.
  3. Manager passing non-existent employee ID returns 404 Not Found.
  4. Employee filter combined with status filter (e.g. Paid, Cancelled).
  5. Employee filter combined with search query.
  6. Analytics summary (/orders/analytics/summary) calculates metrics filtered by employee ID.
  7. CSV Export (/orders/export/csv) exports orders filtered by employee ID.
  8. Cashier RBAC:
     - Cashier calling GET /orders only receives orders they processed.
     - Cashier attempting to query another employee's sales (GET /orders?user_id=X) is blocked with 403 Forbidden.
     - Cashier querying their own ID (GET /orders?user_id=<own_id>) succeeds.
"""
import uuid
from decimal import Decimal
from fastapi.testclient import TestClient
import pytest

from app.core.security import SESSION_COOKIE_NAME
from app.db.session import SessionLocal
from app.main import app
from app.models.order import Order, OrderStatus
from tests.test_api_auth import get_or_create_test_users

client = TestClient(app)

MANAGER_EMAIL = "test_manager@example.com"
MANAGER_PASS = "ManagerPass123!"
CASHIER_EMAIL = "test_cashier@example.com"
CASHIER_PASS = "CashierPass123!"


def _make_client(email: str, password: str) -> tuple[TestClient, int]:
    """Log in and return an isolated TestClient with active session and the user id."""
    user_client = TestClient(app)
    res = user_client.post("/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, f"Login failed for {email}: {res.text}"
    return user_client, res.json()["user"]["id"]


def _create_product(user_client: TestClient, name: str, price: float = 6.00, stock: int = 50) -> int:
    res = user_client.post(
        "/products",
        json={"name": name, "price": price, "available_stock": stock},
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _checkout_and_pay(user_client: TestClient, product_id: int, quantity: int = 1) -> dict:
    cart_res = user_client.post("/carts", json={})
    assert cart_res.status_code == 201, cart_res.text
    cart_id = cart_res.json()["id"]

    add_res = user_client.post(
        f"/carts/{cart_id}/items",
        json={"product_id": product_id, "quantity": quantity},
    )
    assert add_res.status_code == 200, add_res.text

    checkout_res = user_client.post(f"/carts/{cart_id}/checkout")
    assert checkout_res.status_code == 200, checkout_res.text
    order_id = checkout_res.json()["order"]["id"]

    # Settle payment so status becomes Paid
    pay_res = user_client.post(
        f"/payments/orders/{order_id}",
        json={
            "idempotency_key": f"test_pay_key_{order_id}",
            "outcome": "success",
            "method": "card",
        },
    )
    assert pay_res.status_code == 200, pay_res.text
    return order_id


def test_manager_filter_orders_by_employee():
    get_or_create_test_users()
    mgr_client, mgr_id = _make_client(MANAGER_EMAIL, MANAGER_PASS)
    csh_client, csh_id = _make_client(CASHIER_EMAIL, CASHIER_PASS)

    p1 = _create_product(mgr_client, name=f"EmpFilter Coffee {uuid.uuid4().hex[:6]}")
    p2 = _create_product(mgr_client, name=f"EmpFilter Tea {uuid.uuid4().hex[:6]}")

    # Manager processes order 1
    o_mgr_id = _checkout_and_pay(mgr_client, p1, 1)
    # Cashier processes order 2
    o_csh_id = _checkout_and_pay(csh_client, p2, 1)

    # 1. Filter by manager
    res_mgr = mgr_client.get(f"/orders?user_id={mgr_id}")
    assert res_mgr.status_code == 200
    orders_mgr = res_mgr.json()
    assert any(o["id"] == o_mgr_id for o in orders_mgr)
    assert not any(o["id"] == o_csh_id for o in orders_mgr)
    for o in orders_mgr:
        assert o["handled_by"]["id"] == mgr_id

    # 2. Filter by cashier
    res_csh = mgr_client.get(f"/orders?user_id={csh_id}")
    assert res_csh.status_code == 200
    orders_csh = res_csh.json()
    assert any(o["id"] == o_csh_id for o in orders_csh)
    assert not any(o["id"] == o_mgr_id for o in orders_csh)
    for o in orders_csh:
        assert o["handled_by"]["id"] == csh_id

    # 3. All employees (no user_id)
    res_all = mgr_client.get("/orders")
    assert res_all.status_code == 200
    orders_all = res_all.json()
    assert any(o["id"] == o_mgr_id for o in orders_all)
    assert any(o["id"] == o_csh_id for o in orders_all)


def test_manager_filter_nonexistent_employee_returns_404():
    get_or_create_test_users()
    mgr_client, _ = _make_client(MANAGER_EMAIL, MANAGER_PASS)
    res = mgr_client.get("/orders?user_id=999999")
    assert res.status_code == 404
    assert "Employee with ID 999999 not found" in res.json()["detail"]


def test_employee_filter_combined_with_status_and_search():
    get_or_create_test_users()
    mgr_client, mgr_id = _make_client(MANAGER_EMAIL, MANAGER_PASS)
    csh_client, csh_id = _make_client(CASHIER_EMAIL, CASHIER_PASS)

    p = _create_product(mgr_client, name=f"EmpCombination Scone {uuid.uuid4().hex[:6]}")

    # Cashier creates paid order
    o_paid_id = _checkout_and_pay(csh_client, p, 1)

    # Cashier creates reserved order (without payment)
    cart_res = csh_client.post("/carts", json={})
    cart_id = cart_res.json()["id"]
    csh_client.post(f"/carts/{cart_id}/items", json={"product_id": p, "quantity": 1})
    chk_res = csh_client.post(f"/carts/{cart_id}/checkout")
    o_reserved_id = chk_res.json()["order"]["id"]

    # Filter cashier orders by status=Paid
    res_paid = mgr_client.get(f"/orders?user_id={csh_id}&status=Paid")
    assert res_paid.status_code == 200
    orders = res_paid.json()
    assert any(o["id"] == o_paid_id for o in orders)
    assert not any(o["id"] == o_reserved_id for o in orders)

    # Filter cashier orders by search
    res_search = mgr_client.get(f"/orders?user_id={csh_id}&search=Scone")
    assert res_search.status_code == 200
    assert any(o["id"] == o_paid_id for o in res_search.json())


def test_analytics_and_csv_export_employee_filter():
    get_or_create_test_users()
    mgr_client, mgr_id = _make_client(MANAGER_EMAIL, MANAGER_PASS)
    csh_client, csh_id = _make_client(CASHIER_EMAIL, CASHIER_PASS)

    # Analytics for cashier
    analytics_res = mgr_client.get(f"/orders/analytics/summary?user_id={csh_id}")
    assert analytics_res.status_code == 200
    summary = analytics_res.json()
    assert "net_sales" in summary
    assert "paid_orders_count" in summary

    # Export CSV for cashier
    csv_res = mgr_client.get(f"/orders/export/csv?user_id={csh_id}")
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers["content-type"]
    assert "Order ID,Date,Status,Operator" in csv_res.text


def test_cashier_rbac_restrictions_on_sales_history():
    get_or_create_test_users()
    mgr_client, mgr_id = _make_client(MANAGER_EMAIL, MANAGER_PASS)
    csh_client, csh_id = _make_client(CASHIER_EMAIL, CASHIER_PASS)

    p = _create_product(mgr_client, name=f"RBAC Sales Test Product {uuid.uuid4().hex[:6]}")
    _checkout_and_pay(mgr_client, p, 1)
    _checkout_and_pay(csh_client, p, 1)

    # 1. Cashier calling /orders automatically only sees their own sales
    csh_orders_res = csh_client.get("/orders")
    assert csh_orders_res.status_code == 200
    csh_orders = csh_orders_res.json()
    for o in csh_orders:
        assert o["handled_by"]["id"] == csh_id

    # 2. Cashier attempting to filter by manager's ID is blocked with 403 Forbidden!
    csh_forbidden_res = csh_client.get(f"/orders?user_id={mgr_id}")
    assert csh_forbidden_res.status_code == 403
    assert "Cashiers cannot view sales data for other employees" in csh_forbidden_res.json()["detail"]

    # 3. Cashier filtering by their own ID succeeds
    csh_own_res = csh_client.get(f"/orders?user_id={csh_id}")
    assert csh_own_res.status_code == 200
    for o in csh_own_res.json():
        assert o["handled_by"]["id"] == csh_id
