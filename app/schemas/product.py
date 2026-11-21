import re
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


def validate_barcode_string(v: str | None) -> str | None:
    if v is None:
        return None
    trimmed = v.strip()
    if not trimmed:
        return None

    # If the user entered digits separated by spaces (as printed on retail product packaging,
    # e.g. "0 12345 67890 5" or "8 901030 384592"), normalize by removing internal spaces
    # so it matches the raw contiguous digits produced by optical/laser barcode scanners.
    digits_no_spaces = re.sub(r"\s+", "", trimmed)
    if digits_no_spaces.isdigit() and len(digits_no_spaces) >= 3:
        trimmed = digits_no_spaces

    if len(trimmed) < 1 or len(trimmed) > 64:
        raise ValueError("Barcode must be between 1 and 64 characters.")

    # Allow standard printable barcode characters (alphanumeric, hyphens, dots, slashes, colons, hashes, etc.)
    if not re.match(r"^[A-Za-z0-9\-_.+/:#@$%*&()=\[\] ]+$", trimmed):
        raise ValueError(
            "Barcode contains invalid characters. Use alphanumeric characters or standard barcode symbols (- _ . / : # + * $ % & ( ))."
        )
    return trimmed


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    price: Decimal = Field(gt=0, decimal_places=2)
    available_stock: int = Field(ge=0)
    category: str = Field(default="Coffee", max_length=50)
    barcode: Optional[str] = Field(default=None, max_length=64)

    @field_validator("name")
    @classmethod
    def validate_name_not_blank(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Product name cannot be blank or only whitespace.")
        return trimmed

    @field_validator("barcode")
    @classmethod
    def validate_barcode(cls, v: str | None) -> str | None:
        return validate_barcode_string(v)


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    price: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    available_stock: int | None = Field(default=None, ge=0)
    category: str | None = Field(default=None, max_length=50)
    barcode: Optional[str] = Field(default=None, max_length=64)
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

    @field_validator("barcode")
    @classmethod
    def validate_barcode(cls, v: str | None) -> str | None:
        return validate_barcode_string(v)


class ProductResponse(BaseModel):
    id: int
    name: str
    price: Decimal
    available_stock: int
    category: str = "Coffee"
    barcode: Optional[str] = None
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
