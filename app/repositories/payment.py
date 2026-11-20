from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.payment import Payment


class PaymentRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_order_id(
            self,
            order_id: int,
    ) -> Payment | None:
        statement = select(Payment).where(
            Payment.order_id == order_id,
            )

        return self.db.scalars(statement).first()

    def get_by_idempotency_key(
            self,
            idempotency_key: str,
    ) -> Payment | None:
        statement = select(Payment).where(
            Payment.idempotency_key == idempotency_key,
            )

        return self.db.scalars(statement).first()

    def create(
            self,
            order_id: int,
            idempotency_key: str,
            method: str = "card",
            amount_tendered = None,
            change_due = None,
            reference_id: str | None = None,
    ) -> Payment:
        payment = Payment(
            order_id=order_id,
            idempotency_key=idempotency_key,
            method=method,
            amount_tendered=amount_tendered,
            change_due=change_due,
            reference_id=reference_id,
        )

        self.db.add(payment)
        self.db.flush()

        return payment