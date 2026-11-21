"""add product barcode

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-11-21 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add barcode column to products table
    op.add_column(
        'products',
        sa.Column('barcode', sa.String(length=64), nullable=True),
    )

    # 2. Assign unique barcodes to existing products row-by-row
    canonical_barcodes = {
        1: "012345678905",  # Arabica Espresso
        2: "012345678912",  # Cappuccino
        3: "012345678929",  # Chocolate Croissant
        4: "012345678936",  # Cold Brew Bottle
        5: "012345678943",  # Iced Latte
        6: "012345678950",  # Matcha Latte
        7: "012345678967",  # Blueberry Muffin
        8: "012345678974",  # Premium Coffee Beans
    }

    connection = op.get_bind()
    products = connection.execute(
        sa.text("SELECT id FROM products WHERE barcode IS NULL ORDER BY id ASC")
    ).fetchall()

    used_barcodes = set()
    for row in products:
        p_id = row[0]
        code = canonical_barcodes.get(p_id, f"840000{p_id:06d}")
        while code in used_barcodes:
            p_id += 1000
            code = f"840000{p_id:06d}"
        used_barcodes.add(code)
        connection.execute(
            sa.text("UPDATE products SET barcode = :code WHERE id = :p_id"),
            {"code": code, "p_id": row[0]},
        )

    # 3. Create unique index
    op.create_index('ix_products_barcode', 'products', ['barcode'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_products_barcode', table_name='products')
    op.drop_column('products', 'barcode')
