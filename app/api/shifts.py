from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.user import User, UserRole
from app.schemas.shift import (
    ShiftCloseRequest,
    ShiftOpenRequest,
    ShiftResponse,
    ShiftSummaryResponse,
)
from app.services.shift import ShiftService


router = APIRouter(
    prefix="/shifts",
    tags=["Shifts"],
)


@router.get(
    "/current",
    response_model=ShiftSummaryResponse | None,
)
def get_current_shift(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ShiftService(db)
    shift = service.get_current_shift(current_user.id)
    if shift is None:
        return None
    return service.get_shift_summary(shift.id)


@router.post(
    "/open",
    response_model=ShiftResponse,
    status_code=status.HTTP_201_CREATED,
)
def open_shift(
    data: ShiftOpenRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ShiftService(db)
    return service.open_shift(current_user.id, data.opening_float)


@router.post(
    "/{shift_id}/close",
    response_model=ShiftSummaryResponse,
)
def close_shift(
    shift_id: int,
    data: ShiftCloseRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ShiftService(db)
    return service.close_shift(shift_id, data.closing_cash_actual, data.notes)


@router.get(
    "",
    response_model=list[ShiftResponse],
)
def list_shifts(
    current_user: User = Depends(require_role(UserRole.MANAGER)),
    db: Session = Depends(get_db),
):
    service = ShiftService(db)
    return service.list_shifts()

