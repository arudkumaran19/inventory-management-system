from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class LocationCreate(BaseModel):
    code: str = Field(..., min_length=2, max_length=20)
    name: str = Field(..., min_length=2, max_length=100)
    address: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=50)


class LocationUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=100)
    address: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=50)
    is_active: bool | None = None


class LocationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    address: str | None
    phone: str | None
    is_active: bool
    created_at: datetime

