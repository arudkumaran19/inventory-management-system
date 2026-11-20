"""add pos real world features

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-11-20 20:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Payment fields
    op.add_column('payments', sa.Column('method', sa.String(length=20), nullable=False, server_default='card'))
    op.add_column('payments', sa.Column('amount_tendered', sa.Numeric(precision=10, scale=2), nullable=True))
    op.add_column('payments', sa.Column('change_due', sa.Numeric(precision=10, scale=2), nullable=True))
    op.add_column('payments', sa.Column('reference_id', sa.String(length=100), nullable=True))

    # 2. Product category
    op.add_column('products', sa.Column('category', sa.String(length=50), nullable=False, server_default='Coffee'))

    # Backfill categories based on existing product names
    op.execute("UPDATE products SET category = 'Bakery' WHERE LOWER(name) LIKE '%croissant%' OR LOWER(name) LIKE '%muffin%' OR LOWER(name) LIKE '%cookie%' OR LOWER(name) LIKE '%pastry%'")
    op.execute("UPDATE products SET category = 'Cold Drinks' WHERE LOWER(name) LIKE '%iced%' OR LOWER(name) LIKE '%cold%'")
    op.execute("UPDATE products SET category = 'Tea' WHERE LOWER(name) LIKE '%tea%' OR LOWER(name) LIKE '%matcha%' OR LOWER(name) LIKE '%chai%'")
    op.execute("UPDATE products SET category = 'Retail' WHERE LOWER(name) LIKE '%bean%' OR LOWER(name) LIKE '%bottle%' OR LOWER(name) LIKE '%bag%'")

    # 3. Cart parking & discounts
    op.add_column('carts', sa.Column('label', sa.String(length=100), nullable=True))
    op.add_column('carts', sa.Column('discount_percent', sa.Numeric(precision=5, scale=2), nullable=False, server_default='0'))
    op.add_column('carts', sa.Column('discount_reason', sa.String(length=100), nullable=True))

    # 4. Order discounts & customer table
    op.add_column('orders', sa.Column('discount_percent', sa.Numeric(precision=5, scale=2), nullable=False, server_default='0'))
    op.add_column('orders', sa.Column('discount_amount', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0'))
    op.add_column('orders', sa.Column('discount_reason', sa.String(length=100), nullable=True))
    op.add_column('orders', sa.Column('table_or_customer', sa.String(length=100), nullable=True))

    # 5. CartItem & OrderItem notes/modifiers
    op.add_column('cart_items', sa.Column('notes', sa.String(length=255), nullable=True))
    op.add_column('order_items', sa.Column('notes', sa.String(length=255), nullable=True))

    # 6. Inventory Logs table
    op.create_table(
        'inventory_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('previous_stock', sa.Integer(), nullable=False),
        sa.Column('new_stock', sa.Integer(), nullable=False),
        sa.Column('change_amount', sa.Integer(), nullable=False),
        sa.Column('reason', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_inventory_logs_product_id'), 'inventory_logs', ['product_id'], unique=False)

    # 7. Register Shifts table
    op.create_table(
        'register_shifts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('opened_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('opening_float', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0.00'),
        sa.Column('closing_cash_actual', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('expected_cash', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('card_total', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0.00'),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='Open'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('register_shifts')
    op.drop_index(op.f('ix_inventory_logs_product_id'), table_name='inventory_logs')
    op.drop_table('inventory_logs')
    op.drop_column('order_items', 'notes')
    op.drop_column('cart_items', 'notes')
    op.drop_column('orders', 'table_or_customer')
    op.drop_column('orders', 'discount_reason')
    op.drop_column('orders', 'discount_amount')
    op.drop_column('orders', 'discount_percent')
    op.drop_column('carts', 'discount_reason')
    op.drop_column('carts', 'discount_percent')
    op.drop_column('carts', 'label')
    op.drop_column('products', 'category')
    op.drop_column('payments', 'reference_id')
    op.drop_column('payments', 'change_due')
    op.drop_column('payments', 'amount_tendered')
    op.drop_column('payments', 'method')

