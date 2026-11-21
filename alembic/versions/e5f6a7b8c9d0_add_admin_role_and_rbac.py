"""add admin role and rbac

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-11-21 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name

    # 1. Update check constraint on users table to allow 'admin'
    if dialect == "postgresql":
        op.drop_constraint('ck_users_role_valid', 'users', type_='check')
        op.create_check_constraint(
            'ck_users_role_valid',
            'users',
            "role IN ('admin', 'manager', 'cashier')",
        )

    # 2. Idempotently seed default demo Administrator account if not already present
    admin_hash = '$2b$12$lgpY6SyuM1ERfzLbhKwke.mp004zat7ATCiBG0S0XbqgwiEW3URsO'
    conn.execute(
        sa.text(
            """
            INSERT INTO users (email, hashed_password, display_name, role, is_active, created_at, updated_at)
            VALUES ('admin@example.com', :hashed_pwd, 'System Administrator', 'admin', true, NOW(), NOW())
            ON CONFLICT (email) DO UPDATE SET role = 'admin' WHERE users.email = 'admin@example.com';
            """
        ),
        {"hashed_pwd": admin_hash},
    )


def downgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name
    if dialect == "postgresql":
        op.drop_constraint('ck_users_role_valid', 'users', type_='check')
        op.create_check_constraint(
            'ck_users_role_valid',
            'users',
            "role IN ('cashier', 'manager')",
        )
