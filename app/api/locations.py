from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.location import Location
from app.models.user import User, UserRole
from app.schemas.location import LocationCreate, LocationResponse, LocationUpdate
from app.services.audit import AuditService

router = APIRouter(prefix="/locations", tags=["Locations"])


@router.get("", response_model=list[LocationResponse])
def get_locations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Location).where(Location.is_active == True).order_by(Location.id.asc())
    return db.execute(stmt).scalars().all()


@router.post("", response_model=LocationResponse, status_code=status.HTTP_201_CREATED)
def create_location(
    data: LocationCreate,
    db: Session = Depends(get_db),
    current_manager: User = Depends(require_role(UserRole.MANAGER)),
):
    existing = db.execute(select(Location).where(Location.code == data.code.strip().upper())).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Location code already exists")

    location = Location(
        code=data.code.strip().upper(),
        name=data.name.strip(),
        address=data.address.strip() if data.address else None,
        phone=data.phone.strip() if data.phone else None,
    )
    db.add(location)
    db.flush()

    AuditService.log_event(
        db=db,
        event_type="LOCATION_CREATED",
        resource_type="location",
        resource_id=location.id,
        actor=current_manager,
        action="CREATE",
        payload={"code": location.code, "name": location.name},
    )
    db.commit()
    db.refresh(location)
    return location


@router.patch("/{location_id}", response_model=LocationResponse)
def update_location(
    location_id: int,
    data: LocationUpdate,
    db: Session = Depends(get_db),
    current_manager: User = Depends(require_role(UserRole.MANAGER)),
):
    location = db.get(Location, location_id)
    if not location:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")

    if data.name is not None:
        location.name = data.name.strip()
    if data.address is not None:
        location.address = data.address.strip()
    if data.phone is not None:
        location.phone = data.phone.strip()
    if data.is_active is not None:
        location.is_active = data.is_active

    AuditService.log_event(
        db=db,
        event_type="LOCATION_UPDATED",
        resource_type="location",
        resource_id=location.id,
        actor=current_manager,
        action="UPDATE",
        payload={"name": location.name, "is_active": location.is_active},
    )
    db.commit()
    db.refresh(location)
    return location
