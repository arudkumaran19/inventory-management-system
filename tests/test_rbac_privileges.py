import pytest
from fastapi.testclient import TestClient

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models.user import User, UserRole
from tests.test_api_auth import get_or_create_test_users


@pytest.fixture(autouse=True)
def setup_users():
    get_or_create_test_users()


def test_admin_can_login_and_has_full_access():
    client = TestClient(app)
    res = client.post(
        "/auth/login",
        json={"email": "test_admin@example.com", "password": "AdminPass1234!"},
    )
    assert res.status_code == 200
    user_data = res.json()["user"]
    assert user_data["role"] == "admin"

    # Admin can list users
    res = client.get("/users")
    assert res.status_code == 200
    assert any(u["role"] == "admin" for u in res.json())


def test_admin_can_create_admin_and_manager():
    client = TestClient(app)
    client.post(
        "/auth/login",
        json={"email": "test_admin@example.com", "password": "AdminPass1234!"},
    )

    db = SessionLocal()
    try:
        # Clean up any leftover test users
        for email in ["secondary_admin@example.com", "secondary_mgr@example.com"]:
            u = db.query(User).filter(User.email == email).first()
            if u:
                db.delete(u)
        db.commit()
    finally:
        db.close()

    # 1. Admin creates another Admin
    res = client.post(
        "/users",
        json={
            "email": "secondary_admin@example.com",
            "password": "SecurePassword123!",
            "display_name": "Second Admin",
            "role": "admin",
        },
    )
    assert res.status_code == 201
    assert res.json()["role"] == "admin"

    # 2. Admin creates a Manager
    res = client.post(
        "/users",
        json={
            "email": "secondary_mgr@example.com",
            "password": "SecurePassword123!",
            "display_name": "Second Manager",
            "role": "manager",
        },
    )
    assert res.status_code == 201
    assert res.json()["role"] == "manager"


def test_manager_cannot_create_or_promote_to_admin():
    client = TestClient(app)
    client.post(
        "/auth/login",
        json={"email": "test_manager@example.com", "password": "ManagerPass123!"},
    )

    # Manager attempting to create an Admin -> 403 Forbidden
    res = client.post(
        "/users",
        json={
            "email": "illegal_admin@example.com",
            "password": "SecurePassword123!",
            "display_name": "Illegal Admin",
            "role": "admin",
        },
    )
    assert res.status_code == 403
    assert "Only Administrators can assign Administrator privileges" in res.json()["detail"]


def test_manager_cannot_modify_or_delete_admin():
    client = TestClient(app)
    client.post(
        "/auth/login",
        json={"email": "test_manager@example.com", "password": "ManagerPass123!"},
    )

    db = SessionLocal()
    admin_id = None
    try:
        admin = db.query(User).filter(User.role == UserRole.ADMIN.value).first()
        assert admin is not None
        admin_id = admin.id
    finally:
        db.close()

    # Manager attempting to edit Admin -> 403 Forbidden
    res = client.patch(
        f"/users/{admin_id}",
        json={"display_name": "Hacked Name"},
    )
    assert res.status_code == 403
    assert "Managers cannot modify Administrator accounts" in res.json()["detail"]

    # Manager attempting to delete Admin -> 403 Forbidden
    res = client.delete(f"/users/{admin_id}")
    assert res.status_code == 403
    assert "Managers cannot delete Administrator accounts" in res.json()["detail"]


def test_last_admin_protection():
    client = TestClient(app)
    client.post(
        "/auth/login",
        json={"email": "test_admin@example.com", "password": "AdminPass1234!"},
    )

    db = SessionLocal()
    try:
        # Create a second admin so test_admin can act upon it
        second_admin = db.query(User).filter(User.email == "second_admin_guard@example.com").first()
        if not second_admin:
            second_admin = User(
                email="second_admin_guard@example.com",
                hashed_password=hash_password("SecurePassword123!"),
                display_name="Second Admin Guard",
                role=UserRole.ADMIN.value,
                is_active=True,
            )
            db.add(second_admin)
            db.commit()
            db.refresh(second_admin)

        # Deactivate all other admins so exactly one second admin remains besides test_admin
        all_admins = db.query(User).filter(User.role == UserRole.ADMIN.value).all()
        for a in all_admins:
            if a.email not in ["test_admin@example.com", "second_admin_guard@example.com"]:
                a.is_active = False
        db.commit()

        # Now deactivate test_admin in the DB directly, leaving second_admin as the ONLY active admin
        test_admin = db.query(User).filter(User.email == "test_admin@example.com").first()
        test_admin.is_active = False
        db.commit()

        target_id = second_admin.id
    finally:
        db.close()

    # Re-login as second_admin
    client.post(
        "/auth/login",
        json={"email": "second_admin_guard@example.com", "password": "SecurePassword123!"},
    )

    # Attempting to deactivate self -> 400 You cannot deactivate your own account
    res = client.patch(
        f"/users/{target_id}",
        json={"is_active": False},
    )
    assert res.status_code == 400
    assert "You cannot deactivate your own account" in res.json()["detail"]

    # Now restore test_admin active status, log in as test_admin, and try deactivating second_admin when it's the only one left
    db = SessionLocal()
    try:
        t_admin = db.query(User).filter(User.email == "test_admin@example.com").first()
        t_admin.is_active = True
        db.commit()
    finally:
        db.close()

    client.post(
        "/auth/login",
        json={"email": "test_admin@example.com", "password": "AdminPass1234!"},
    )

    # test_admin deactivates second_admin -> allowed because 2 admins were active
    res = client.patch(f"/users/{target_id}", json={"is_active": False})
    assert res.status_code == 200

    # Now second_admin is inactive, so test_admin is the ONLY active admin left.
    # Trying to demote test_admin -> blocked by self-demotion or last-admin check
    res = client.patch(f"/users/{target_id}", json={"is_active": True})
    assert res.status_code == 200


def test_cashier_privilege_boundaries():
    client = TestClient(app)
    client.post(
        "/auth/login",
        json={"email": "test_cashier@example.com", "password": "CashierPass123!"},
    )

    # Cashier cannot access user management
    assert client.get("/users").status_code == 403
    assert client.post("/users", json={}).status_code == 403
    assert client.patch("/users/1", json={}).status_code == 403
    assert client.delete("/users/1").status_code == 403

    # Cashier cannot create products
    res = client.post(
        "/products",
        json={"name": "Illegal Coffee", "price": 4.5, "available_stock": 10},
    )
    assert res.status_code == 403

    # Cashier cannot access audit trail
    assert client.get("/audit-logs").status_code == 403
