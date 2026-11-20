from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    price: Decimal = Field(gt=0, decimal_places=2)
    available_stock: int = Field(ge=0)
    category: str = Field(default="Coffee", max_length=50)

    @field_validator("name")
    @classmethod
    def validate_name_not_blank(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Product name cannot be blank or only whitespace.")
        return trimmed


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    price: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    available_stock: int | None = Field(default=None, ge=0)
    category: str | None = Field(default=None, max_length=50)
    is_active: bool | None = None
    adjustment_reason: str | None = Field(default=None, max_length=100)

    @field_validator("name")
    @classmethod
    def validate_name_not_blank(cls, v: str | None) -> str | None:
        if v is not None:
            trimmed = v.strip()
            if not trimmed:
                raise ValueError("Product name cannot be blank or only whitespace.")
            return trimmed
        return v


class ProductResponse(BaseModel):
    id: int
    name: str
    price: Decimal
    available_stock: int
    category: str = "Coffee"
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class InventoryLogResponse(BaseModel):
    id: int
    product_id: int
    user_id: Optional[int] = None
    previous_stock: int
    new_stock: int
    change_amount: int
    reason: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
