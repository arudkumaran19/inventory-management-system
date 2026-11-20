from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field


class IngredientCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    unit: str = Field(..., min_length=1, max_length=20)
    current_stock: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    reorder_threshold: Decimal = Field(default=Decimal("10.00"), ge=Decimal("0.00"))
    cost_per_unit: Decimal = Field(default=Decimal("0.0000"), ge=Decimal("0.0000"))


class IngredientUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=100)
    unit: str | None = Field(None, min_length=1, max_length=20)
    current_stock: Decimal | None = Field(None, ge=Decimal("0.00"))
    reorder_threshold: Decimal | None = Field(None, ge=Decimal("0.00"))
    cost_per_unit: Decimal | None = Field(None, ge=Decimal("0.0000"))
    is_active: bool | None = None
    adjustment_reason: str | None = None


class IngredientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    unit: str
    current_stock: Decimal
    reorder_threshold: Decimal
    cost_per_unit: Decimal
    is_active: bool
    created_at: datetime


class RecipeItemInput(BaseModel):
    ingredient_id: int
    quantity: Decimal = Field(..., gt=Decimal("0.00"))


class RecipeItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    ingredient_id: int
    quantity: Decimal
    ingredient_name: str | None = None
    ingredient_unit: str | None = None
