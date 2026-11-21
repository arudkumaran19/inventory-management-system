"""add p3 features and immutable audit log

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-11-20 21:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Locations table (Multi-Location Tenancy)
    op.create_table(
        'locations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=20), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('address', sa.String(length=255), nullable=True),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code'),
    )
    op.create_index('ix_locations_code', 'locations', ['code'])

    # Seed initial locations
    op.execute(
        "INSERT INTO locations (code, name, address, phone) VALUES "
        "('MAIN', 'Flagship Roastery & Café', '100 Artisan Way, Downtown', '555-0199'), "
        "('UPTOWN', 'Uptown Espresso Bar', '450 Market St, Suite 12', '555-0142')"
    )

    # Add location_id to orders, register_shifts, and users
    op.add_column('orders', sa.Column('location_id', sa.Integer(), sa.ForeignKey('locations.id', ondelete='SET NULL'), nullable=True, server_default='1'))
    op.add_column('register_shifts', sa.Column('location_id', sa.Integer(), sa.ForeignKey('locations.id', ondelete='SET NULL'), nullable=True, server_default='1'))
    op.add_column('users', sa.Column('location_id', sa.Integer(), sa.ForeignKey('locations.id', ondelete='SET NULL'), nullable=True, server_default='1'))

    # 2. Ingredients table (Recipe / BOM)
    op.create_table(
        'ingredients',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('unit', sa.String(length=20), nullable=False),
        sa.Column('current_stock', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0.00'),
        sa.Column('reorder_threshold', sa.Numeric(precision=10, scale=2), nullable=False, server_default='10.00'),
        sa.Column('cost_per_unit', sa.Numeric(precision=10, scale=4), nullable=False, server_default='0.0000'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )

    # Seed baseline café raw ingredients
    op.execute(
        "INSERT INTO ingredients (name, unit, current_stock, reorder_threshold, cost_per_unit) VALUES "
        "('Ethiopian Yirgacheffe Beans', 'g', 15000.00, 2000.00, 0.0350), "
        "('House Espresso Blend', 'g', 25000.00, 5000.00, 0.0250), "
        "('Whole Milk (Organic)', 'ml', 40000.00, 5000.00, 0.0025), "
        "('Oat Milk (Barista Edition)', 'ml', 20000.00, 4000.00, 0.0040), "
        "('Almond Milk', 'ml', 10000.00, 2000.00, 0.0045), "
        "('Matcha Green Tea Powder', 'g', 2000.00, 500.00, 0.0800), "
        "('Madagascar Vanilla Syrup', 'ml', 5000.00, 1000.00, 0.0150), "
        "('Hot Drink Cups (12oz)', 'pcs', 1200.00, 200.00, 0.1200), "
        "('Cold Drink Cups (16oz)', 'pcs', 1000.00, 200.00, 0.1400)"
    )

    # 3. Product Recipes table (BOM link)
    op.create_table(
        'product_recipes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.Column('ingredient_id', sa.Integer(), nullable=False),
        sa.Column('quantity', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['ingredient_id'], ['ingredients.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('product_id', 'ingredient_id', name='uq_product_ingredient'),
    )

    # Seed default recipe mappings for products if they exist
    op.execute("""
        INSERT INTO product_recipes (product_id, ingredient_id, quantity)
        SELECT p.id, i.id, 18.00
        FROM products p, ingredients i
        WHERE p.name ILIKE '%espresso%' AND i.name = 'House Espresso Blend'
        ON CONFLICT DO NOTHING;
    """)
    op.execute("""
        INSERT INTO product_recipes (product_id, ingredient_id, quantity)
        SELECT p.id, i.id, 200.00
        FROM products p, ingredients i
        WHERE (p.name ILIKE '%latte%' OR p.name ILIKE '%cappuccino%') AND i.name = 'Whole Milk (Organic)'
        ON CONFLICT DO NOTHING;
    """)

    # 4. Immutable Cryptographic Audit Logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('sequence_number', sa.BigInteger(), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('event_type', sa.String(length=50), nullable=False),
        sa.Column('actor_id', sa.Integer(), nullable=True),
        sa.Column('actor_email', sa.String(length=100), nullable=True),
        sa.Column('actor_role', sa.String(length=20), nullable=True),
        sa.Column('action', sa.String(length=20), nullable=False, server_default='EXECUTE'),
        sa.Column('resource_type', sa.String(length=50), nullable=False),
        sa.Column('resource_id', sa.String(length=100), nullable=True),
        sa.Column('payload', sa.Text(), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('previous_hash', sa.String(length=64), nullable=False),
        sa.Column('record_hash', sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('sequence_number'),
    )
    op.create_index('ix_audit_logs_timestamp', 'audit_logs', ['timestamp'])
    op.create_index('ix_audit_logs_sequence', 'audit_logs', ['sequence_number'])
    op.create_index('ix_audit_logs_event_type', 'audit_logs', ['event_type'])

    # 5. Database-level immutability enforcement trigger
    op.execute("""
        CREATE OR REPLACE FUNCTION prevent_audit_log_tampering()
        RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP = 'DELETE' THEN
                RAISE EXCEPTION 'audit_logs is an append-only immutable ledger: UPDATE and DELETE operations are strictly forbidden.';
            END IF;
            IF TG_OP = 'UPDATE' THEN
                IF (OLD.sequence_number = NEW.sequence_number AND
                    OLD.timestamp = NEW.timestamp AND
                    OLD.event_type = NEW.event_type AND
                    OLD.actor_email IS NOT DISTINCT FROM NEW.actor_email AND
                    OLD.actor_role IS NOT DISTINCT FROM NEW.actor_role AND
                    OLD.action = NEW.action AND
                    OLD.resource_type = NEW.resource_type AND
                    OLD.resource_id IS NOT DISTINCT FROM NEW.resource_id AND
                    OLD.payload IS NOT DISTINCT FROM NEW.payload AND
                    OLD.previous_hash = NEW.previous_hash AND
                    OLD.record_hash = NEW.record_hash AND
                    NEW.actor_id IS NULL) THEN
                    RETURN NEW;
                END IF;
                RAISE EXCEPTION 'audit_logs is an append-only immutable ledger: UPDATE and DELETE operations are strictly forbidden.';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_audit_log_immutable
        BEFORE UPDATE OR DELETE ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_tampering();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_audit_log_immutable ON audit_logs;")
    op.execute("DROP FUNCTION IF EXISTS prevent_audit_log_tampering();")
    op.drop_table('audit_logs')
    op.drop_table('product_recipes')
    op.drop_table('ingredients')
    op.drop_column('users', 'location_id')
    op.drop_column('register_shifts', 'location_id')
    op.drop_column('orders', 'location_id')
    op.drop_table('locations')

