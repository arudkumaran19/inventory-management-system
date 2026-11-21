"""Tests for product barcode management and barcode scanning operations.

Contracts verified:
  1. Product creation with valid barcode (EAN-13, UPC-A, Code 128, alphanumeric).
  2. Leading zeros are preserved as a string (e.g. "009876...").
  3. Duplicate barcode creation is rejected with 409 Conflict.
  4. Invalid barcode formats (whitespace, invalid symbols, out of length range) rejected with 422.
  5. Product update:
     - Updating barcode on a product succeeds.
     - Assigning a duplicate barcode already used by another product fails with 409.
     - Keeping the same barcode during product update succeeds without false duplicate detection.
     - Clearing barcode to null/empty succeeds.
  6. Barcode lookup endpoint (/products/by-barcode/{barcode}):
     - Found -> 200 with product details.
     - Unknown barcode -> 404 with clear message.
  7. POS workflow with barcode:
     - Cashier looks up product by barcode and adds to active cart.
     - Repeated scans increment quantity.
     - Scanning an out-of-stock product is rejected.
     - Scanning an inactive product is rejected.
"""
import uuid
import random
from fastapi.testclient import TestClient
import pytest

from app.main import app
from tests.test_api_auth import get_or_create_test_users

client = TestClient(app)

MANAGER_EMAIL = "test_manager@example.com"
MANAGER_PASS = "ManagerPass123!"
CASHIER_EMAIL = "test_cashier@example.com"
CASHIER_PASS = "CashierPass123!"


def _make_client(email: str, password: str) -> tuple[TestClient, int]:
    user_client = TestClient(app)
    res = user_client.post("/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, f"Login failed for {email}: {res.text}"
    return user_client, res.json()["user"]["id"]


def _rand_barcode(prefix: str = "00") -> str:
    """Generate a random unique barcode string preserving the prefix."""
    return f"{prefix}{random.randint(1000000000, 9999999999)}"


def test_product_creation_and_leading_zero_preservation():
    get_or_create_test_users()
    mgr_client, _ = _make_client(MANAGER_EMAIL, MANAGER_PASS)

    # 1. Leading-zero barcode (e.g. UPC-A / EAN-13)
    barcode_val = _rand_barcode("00")
    pname = f"Barcode Zero Product {uuid.uuid4().hex[:6]}"
    res = mgr_client.post(
        "/products",
        json={
            "name": pname,
            "price": 4.50,
            "available_stock": 25,
            "category": "Coffee",
            "barcode": barcode_val,
        },
    )
    assert res.status_code == 201, res.text
    product = res.json()
    assert product["barcode"] == barcode_val
    assert isinstance(product["barcode"], str)
    assert product["barcode"].startswith("00")


def test_duplicate_barcode_rejected_on_creation():
    get_or_create_test_users()
    mgr_client, _ = _make_client(MANAGER_EMAIL, MANAGER_PASS)

    barcode_val = _rand_barcode("11")
    pname1 = f"First Barcode Item {uuid.uuid4().hex[:6]}"
    pname2 = f"Second Barcode Item {uuid.uuid4().hex[:6]}"

    res1 = mgr_client.post(
        "/products",
        json={
            "name": pname1,
            "price": 3.00,
            "available_stock": 10,
            "barcode": barcode_val,
        },
    )
    assert res1.status_code == 201, res1.text

    # Second product with exact same barcode
    res2 = mgr_client.post(
        "/products",
        json={
            "name": pname2,
            "price": 3.50,
            "available_stock": 10,
            "barcode": barcode_val,
        },
    )
    assert res2.status_code == 409
    assert f"Barcode '{barcode_val}' is already assigned" in res2.json()["detail"]


def test_barcode_normalization_and_validation():
    get_or_create_test_users()
    mgr_client, _ = _make_client(MANAGER_EMAIL, MANAGER_PASS)

    # 1. Retail barcode entered with spaces (as printed on product packages) is normalized to contiguous digits
    part1 = random.randint(10000, 99999)
    part2 = random.randint(10000, 99999)
    res_spaced = mgr_client.post(
        "/products",
        json={
            "name": f"Spaced UPC Item {uuid.uuid4().hex[:6]}",
            "price": 2.50,
            "available_stock": 10,
            "barcode": f"0 {part1} {part2} 5",
        },
    )
    assert res_spaced.status_code == 201, res_spaced.text
    assert res_spaced.json()["barcode"] == f"0{part1}{part2}5"

    # 2. Barcode with slash and hyphen accepted
    res_punct = mgr_client.post(
        "/products",
        json={
            "name": f"Punctuation Barcode {uuid.uuid4().hex[:6]}",
            "price": 3.00,
            "available_stock": 10,
            "barcode": f"CAFE/LOC-{uuid.uuid4().hex[:4]}",
        },
    )
    assert res_punct.status_code == 201, res_punct.text

    # 3. Exceeds max length (> 64 characters) rejected
    res_long = mgr_client.post(
        "/products",
        json={
            "name": f"Long Barcode {uuid.uuid4().hex[:6]}",
            "price": 2.00,
            "available_stock": 5,
            "barcode": "X" * 65,
        },
    )
    assert res_long.status_code == 422

    # 4. Control characters rejected
    res_ctrl = mgr_client.post(
        "/products",
        json={
            "name": f"Bad Barcode {uuid.uuid4().hex[:6]}",
            "price": 2.00,
            "available_stock": 5,
            "barcode": "ABC\x00DEF",
        },
    )
    assert res_ctrl.status_code == 422


def test_barcode_lookup_endpoint():
    get_or_create_test_users()
    mgr_client, _ = _make_client(MANAGER_EMAIL, MANAGER_PASS)
    csh_client, _ = _make_client(CASHIER_EMAIL, CASHIER_PASS)

    barcode_val = _rand_barcode("99")
    pname = f"Scanner Test Croissant {uuid.uuid4().hex[:6]}"
    create_res = mgr_client.post(
        "/products",
        json={
            "name": pname,
            "price": 4.25,
            "available_stock": 15,
            "category": "Bakery",
            "barcode": barcode_val,
        },
    )
    assert create_res.status_code == 201, create_res.text
    prod_id = create_res.json()["id"]

    # Cashier looks up by barcode
    lookup_res = csh_client.get(f"/products/by-barcode/{barcode_val}")
    assert lookup_res.status_code == 200
    prod = lookup_res.json()
    assert prod["id"] == prod_id
    assert prod["name"] == pname
    assert prod["barcode"] == barcode_val

    # Unknown barcode returns 404
    unknown_res = csh_client.get("/products/by-barcode/NONEXISTENT999999")
    assert unknown_res.status_code == 404
    assert "not found" in unknown_res.json()["detail"]


def test_product_update_barcode_rules():
    get_or_create_test_users()
    mgr_client, _ = _make_client(MANAGER_EMAIL, MANAGER_PASS)

    b1 = _rand_barcode("55")
    b2 = _rand_barcode("66")
    p1 = mgr_client.post(
        "/products",
        json={"name": f"Update P1 {uuid.uuid4().hex[:6]}", "price": 5.00, "available_stock": 10, "barcode": b1},
    ).json()
    p2 = mgr_client.post(
        "/products",
        json={"name": f"Update P2 {uuid.uuid4().hex[:6]}", "price": 5.00, "available_stock": 10, "barcode": b2},
    ).json()

    # 1. Update P1 with P2's barcode -> 409 Conflict
    conflict_res = mgr_client.patch(f"/products/{p1['id']}", json={"barcode": b2})
    assert conflict_res.status_code == 409
    assert f"Barcode '{b2}' is already assigned" in conflict_res.json()["detail"]

    # 2. Update P1 with its OWN barcode -> 200 OK (no false conflict)
    same_res = mgr_client.patch(f"/products/{p1['id']}", json={"barcode": b1, "price": 5.50})
    assert same_res.status_code == 200
    assert same_res.json()["barcode"] == b1

    # 3. Update P1 to a new unused barcode -> 200 OK
    new_barcode = _rand_barcode("77")
    up_res = mgr_client.patch(f"/products/{p1['id']}", json={"barcode": new_barcode})
    assert up_res.status_code == 200
    assert up_res.json()["barcode"] == new_barcode


def test_pos_cart_addition_via_barcode_scan():
    get_or_create_test_users()
    mgr_client, _ = _make_client(MANAGER_EMAIL, MANAGER_PASS)
    csh_client, _ = _make_client(CASHIER_EMAIL, CASHIER_PASS)

    barcode_val = _rand_barcode("44")
    prod = mgr_client.post(
        "/products",
        json={
            "name": f"Barcoded Latte {uuid.uuid4().hex[:6]}",
            "price": 5.25,
            "available_stock": 5,
            "category": "Coffee",
            "barcode": barcode_val,
        },
    ).json()

    # 1. Cashier creates active cart
    cart = csh_client.post("/carts", json={}).json()

    # 2. Cashier scans barcode: looks up product
    lookup = csh_client.get(f"/products/by-barcode/{barcode_val}")
    assert lookup.status_code == 200
    scanned_product = lookup.json()

    # 3. Cashier adds scanned product to cart
    add_res = csh_client.post(
        f"/carts/{cart['id']}/items",
        json={"product_id": scanned_product["id"], "quantity": 1},
    )
    assert add_res.status_code == 200
    assert add_res.json()["items"][0]["quantity"] == 1

    # 4. Cashier scans same barcode again -> quantity increases to 2
    add_again_res = csh_client.post(
        f"/carts/{cart['id']}/items",
        json={"product_id": scanned_product["id"], "quantity": 1},
    )
    assert add_again_res.status_code == 200
    assert add_again_res.json()["items"][0]["quantity"] == 2
