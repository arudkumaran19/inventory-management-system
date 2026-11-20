from datetime import datetime, timezone
from decimal import Decimal
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.order import Order, OrderStatus
from app.models.payment import PaymentMethod, PaymentStatus
from app.models.shift import RegisterShift, ShiftStatus
from app.models.user import User
from app.services.audit import AuditService


class ShiftService:
    def __init__(self, db: Session):
        self.db = db

    def get_current_shift(self, user_id: int | None = None) -> RegisterShift | None:
        stmt = (
            select(RegisterShift)
            .where(RegisterShift.status == ShiftStatus.OPEN.value)
            .order_by(RegisterShift.id.desc())
        )
        if user_id is not None:
            # Check user shift or any open shift for the venue register
            user_shift = self.db.scalars(stmt.where(RegisterShift.user_id == user_id)).first()
            if user_shift:
                return user_shift
        return self.db.scalars(stmt).first()

    def open_shift(self, user_id: int, opening_float: Decimal) -> RegisterShift:
        current = self.get_current_shift(user_id)
        if current is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="There is already an open register shift.",
            )

        shift = RegisterShift(
            user_id=user_id,
            opening_float=opening_float,
            status=ShiftStatus.OPEN.value,
            opened_at=datetime.now(timezone.utc),
        )
        self.db.add(shift)
        self.db.flush()

        actor = self.db.get(User, user_id)
        AuditService.log_event(
            db=self.db,
            event_type="SHIFT_OPENED",
            resource_type="shift",
            resource_id=shift.id,
            actor=actor,
            action="EXECUTE",
            payload={"opening_float": str(opening_float)},
        )

        self.db.commit()
        self.db.refresh(shift)
        return shift

    def get_shift_summary(self, shift_id: int) -> dict:
        shift = self.db.get(RegisterShift, shift_id)
        if shift is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Register shift not found",
            )

        start_time = shift.opened_at
        end_time = shift.closed_at or datetime.now(timezone.utc)

        # Query all paid orders finalized between start_time and end_time
        orders_stmt = (
            select(Order)
            .where(
                Order.status == OrderStatus.PAID.value,
                Order.completed_at >= start_time,
                Order.completed_at <= end_time,
            )
            .options(
                selectinload(Order.items),
                selectinload(Order.payment),
            )
        )
        orders = list(self.db.scalars(orders_stmt).all())

        cash_sales = Decimal("0.00")
        card_sales = Decimal("0.00")
        total_orders = len(orders)

        for o in orders:
            # Order total after discount
            subtotal = sum(item.unit_price * item.quantity for item in o.items)
            order_total = subtotal - (o.discount_amount or Decimal("0.00"))
            if o.payment and o.payment.method == PaymentMethod.CASH.value:
                cash_sales += order_total
            else:
                card_sales += order_total

        total_sales = cash_sales + card_sales
        expected_cash = shift.opening_float + cash_sales
        variance = (shift.closing_cash_actual - expected_cash) if shift.closing_cash_actual is not None else None

        return {
            "shift": shift,
            "cash_sales": cash_sales,
            "card_sales": card_sales,
            "total_sales": total_sales,
            "total_orders": total_orders,
            "expected_cash": expected_cash,
            "variance": variance,
        }

    def close_shift(
        self,
        shift_id: int,
        closing_cash_actual: Decimal,
        notes: str | None = None,
    ) -> dict:
        shift = self.db.get(RegisterShift, shift_id)
        if shift is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Register shift not found",
            )
        if shift.status == ShiftStatus.CLOSED.value:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Register shift is already closed",
            )

        now = datetime.now(timezone.utc)
        shift.closed_at = now
        shift.status = ShiftStatus.CLOSED.value
        shift.closing_cash_actual = closing_cash_actual
        shift.notes = notes.strip() if notes else None

        # Pre-calculate summary to store expected cash & card total
        summary = self.get_shift_summary(shift_id)
        shift.expected_cash = summary["expected_cash"]
        shift.card_total = summary["card_sales"]

        actor = self.db.get(User, shift.user_id)
        AuditService.log_event(
            db=self.db,
            event_type="SHIFT_CLOSED",
            resource_type="shift",
            resource_id=shift.id,
            actor=actor,
            action="EXECUTE",
            payload={
                "closing_cash_actual": str(closing_cash_actual),
                "expected_cash": str(summary["expected_cash"]),
                "variance": str(summary["variance"]),
                "notes": notes,
            },
        )

        self.db.commit()
        self.db.refresh(shift)

        return self.get_shift_summary(shift_id)

    def list_shifts(self) -> list[RegisterShift]:
        stmt = select(RegisterShift).order_by(RegisterShift.id.desc())
        return list(self.db.scalars(stmt).all())

