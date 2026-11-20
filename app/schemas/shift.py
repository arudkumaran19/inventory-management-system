from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ShiftOpenRequest(BaseModel):
    opening_float: Decimal = Field(default=Decimal("150.00"), ge=0)


class ShiftCloseRequest(BaseModel):
    closing_cash_actual: Decimal = Field(ge=0)
    notes: Optional[str] = None


class ShiftResponse(BaseModel):
    id: int
    user_id: int
    opened_at: datetime
    closed_at: Optional[datetime] = None
    opening_float: Decimal
    closing_cash_actual: Optional[Decimal] = None
    expected_cash: Optional[Decimal] = None
    card_total: Decimal = Decimal("0.00")
    status: str
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ShiftSummaryResponse(BaseModel):
    shift: ShiftResponse
    cash_sales: Decimal
    card_sales: Decimal
    total_sales: Decimal
    total_orders: int
    expected_cash: Decimal
    variance: Optional[Decimal] = None

