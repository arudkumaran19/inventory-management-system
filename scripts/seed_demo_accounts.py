import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.session import SessionLocal
from app.models.user import User
from app.core.security import hash_password

def seed_demo_accounts():
    db = SessionLocal()
    try:
        users = [
            {
                "email": "manager@example.com",
                "display_name": "Store Manager",
                "role": "manager",
                "password": "ManagerPass123!",
            },
            {
                "email": "cashier@example.com",
                "display_name": "Barista Cashier",
                "role": "cashier",
                "password": "CashierPass123!",
            },
        ]
        for u_data in users:
            existing = db.query(User).filter(User.email == u_data["email"]).first()
            if existing:
                existing.display_name = u_data["display_name"]
                existing.role = u_data["role"]
                existing.is_active = True
                existing.hashed_password = hash_password(u_data["password"])
            else:
                user = User(
                    email=u_data["email"],
                    display_name=u_data["display_name"],
                    role=u_data["role"],
                    is_active=True,
                    hashed_password=hash_password(u_data["password"]),
                )
                db.add(user)
        db.commit()
        print("Demo accounts (manager@example.com & cashier@example.com) successfully verified and seeded.")
    finally:
        db.close()

if __name__ == "__main__":
    seed_demo_accounts()
