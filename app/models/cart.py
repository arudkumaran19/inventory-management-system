from decimal import Decimal
from sqlalchemy import Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Cart(Base):
    __tablename__ = "carts"

    id: Mapped[int] = mapped_column(primary_key=True)

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="Active",
    )

    label: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        default=None,
    )

    discount_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2),
        nullable=False,
        default=Decimal("0.00"),
    )

    discount_reason: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        default=None,
    )

    items: Mapped[list["CartItem"]] = relationship(
        back_populates="cart",
        cascade="all, delete-orphan",
    )