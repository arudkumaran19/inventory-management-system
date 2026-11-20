from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from app.services.payment import PaymentOutcome


class PaymentRequest(BaseModel):
    idempotency_key: str = Field(
        min_length=1,
        max_length=255,
    )

    outcome: PaymentOutcome
    method: str = Field(default="card", max_length=20)
    amount_tendered: Optional[Decimal] = None
    change_due: Optional[Decimal] = None
    reference_id: Optional[str] = Field(default=None, max_length=100)


class PaymentResponse(BaseModel):
    id: int
    order_id: int
    idempotency_key: str
    status: str
    method: str = "card"
    amount_tendered: Optional[Decimal] = None
    change_due: Optional[Decimal] = None
    reference_id: Optional[str] = None
    processed_at: Optional[datetime] = None

    model_config = {
        "from_attributes": True,
    }