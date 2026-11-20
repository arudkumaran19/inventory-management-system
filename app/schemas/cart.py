from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class CartItemCreate(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0)
    notes: Optional[str] = Field(default=None, max_length=255)


class CartItemUpdate(BaseModel):
    quantity: int = Field(gt=0)
    notes: Optional[str] = Field(default=None, max_length=255)


class CartItemResponse(BaseModel):
    product_id: int
    quantity: int
    notes: Optional[str] = None

    model_config = {
        "from_attributes": True,
    }


class CartCreate(BaseModel):
    label: Optional[str] = Field(default=None, max_length=100)


class CartParkRequest(BaseModel):
    label: str = Field(min_length=1, max_length=100)


class CartDiscountRequest(BaseModel):
    discount_percent: Decimal = Field(ge=0, le=100)
    discount_reason: Optional[str] = Field(default=None, max_length=100)


class CartResponse(BaseModel):
    id: int
    status: str
    label: Optional[str] = None
    discount_percent: Decimal = Decimal("0.00")
    discount_reason: Optional[str] = None
    items: list[CartItemResponse]

    model_config = {
        "from_attributes": True,
    }