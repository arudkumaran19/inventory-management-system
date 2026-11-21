from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.security import hash_password, validate_password_strength
from app.db.session import get_db
from app.models.user import User, UserRole, UserSession
from app.schemas.auth import (
    MessageResponse,
    UserCreate,
    UserResponse,
    UserUpdate,
)

router = APIRouter(
    prefix="/users",
    tags=["User Management"],
)


@router.get(
    "",
    response_model=list[UserResponse],
    status_code=status.HTTP_200_OK,
)
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.MANAGER)),
):
    """List all registered operators (Admin and Manager only)."""
    users = db.query(User).order_by(User.id.asc()).all()
    return [UserResponse.model_validate(u) for u in users]


@router.post(
    "",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.MANAGER)),
):
    """Create a new operator account (Admin and Manager).

    RBAC Rules:
    - Administrators can create Cashiers, Managers, or other Administrators.
    - Managers can create Cashiers or Managers, but CANNOT create Administrators.
    - Cashiers have no access (enforced by route dependency).
    """
    cleaned_email = data.email.strip().lower()

    if not cleaned_email or "@" not in cleaned_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A valid email address is required.",
        )

    # Validate role against all supported system roles
    valid_roles = [UserRole.CASHIER.value, UserRole.MANAGER.value, UserRole.ADMIN.value]
    if data.role not in valid_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Role must be one of {valid_roles}",
        )

    # Privilege escalation guard: Only Administrators can create another Administrator
    if data.role == UserRole.ADMIN.value and current_user.role != UserRole.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Administrators can assign Administrator privileges.",
        )

    # Validate password strength (min 12 chars)
    validate_password_strength(data.password)

    # Check for existing email
    existing = db.query(User).filter(User.email == cleaned_email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An operator with this email address already exists.",
        )

    hashed = hash_password(data.password)
    user = User(
        email=cleaned_email,
        hashed_password=hashed,
        display_name=data.display_name.strip(),
        role=data.role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return UserResponse.model_validate(user)


@router.patch(
    "/{user_id}",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
)
def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.MANAGER)),
):
    """Update operator details, role, status, or reset password (Admin and Manager).

    RBAC Rules:
    - Administrators have full authority over all user accounts.
    - Managers cannot modify, demote, or deactivate Administrator accounts.
    - Managers cannot promote any user to Administrator.
    - Self-demotion and self-deactivation are rejected.
    - Last-Admin and Last-Manager protections are strictly enforced.
    """
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Operator not found",
        )

    # Privilege hierarchy protection: Managers cannot modify Administrator accounts
    if target_user.role == UserRole.ADMIN.value and current_user.role != UserRole.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Managers cannot modify Administrator accounts.",
        )

    # Privilege escalation protection: Only Administrators can promote a user to Administrator
    if data.role == UserRole.ADMIN.value and current_user.role != UserRole.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Administrators can grant Administrator privileges.",
        )

    # Safeguard against self-lockout
    if target_user.id == current_user.id:
        if data.is_active is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot deactivate your own account.",
            )
        if data.role is not None and data.role != current_user.role:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot demote your own account.",
            )

    # Last-Admin protection: Ensure the organization retains at least one active Administrator
    if target_user.role == UserRole.ADMIN.value and target_user.is_active:
        is_demoting_admin = data.role is not None and data.role != UserRole.ADMIN.value
        is_deactivating_admin = data.is_active is False
        if is_demoting_admin or is_deactivating_admin:
            active_admins = (
                db.scalars(
                    select(User)
                    .where(
                        User.role == UserRole.ADMIN.value,
                        User.is_active.is_(True),
                    )
                    .order_by(User.id.asc())
                    .with_for_update()
                )
                .all()
            )
            if len(active_admins) <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot deactivate or demote the last remaining active Administrator.",
                )

    # Last-Manager protection: Ensure the organization retains at least one active manager
    if target_user.role == UserRole.MANAGER.value and target_user.is_active:
        is_demoting_mgr = data.role is not None and data.role not in [UserRole.MANAGER.value, UserRole.ADMIN.value]
        is_deactivating_mgr = data.is_active is False
        if is_demoting_mgr or is_deactivating_mgr:
            active_managers = (
                db.scalars(
                    select(User)
                    .where(
                        User.role == UserRole.MANAGER.value,
                        User.is_active.is_(True),
                    )
                    .order_by(User.id.asc())
                    .with_for_update()
                )
                .all()
            )
            if len(active_managers) <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot deactivate or demote the last remaining active manager.",
                )

    if data.display_name is not None:
        target_user.display_name = data.display_name.strip()

    if data.role is not None:
        valid_roles = [UserRole.CASHIER.value, UserRole.MANAGER.value, UserRole.ADMIN.value]
        if data.role not in valid_roles:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Role must be one of {valid_roles}",
            )
        target_user.role = data.role

    if data.password is not None:
        validate_password_strength(data.password)
        target_user.hashed_password = hash_password(data.password)
        # Revoke all active sessions on password change for security
        db.query(UserSession).filter(
            UserSession.user_id == target_user.id,
            UserSession.revoked_at.is_(None),
        ).update(
            {"revoked_at": datetime.now(timezone.utc)},
            synchronize_session=False,
        )

    if data.is_active is not None:
        target_user.is_active = data.is_active
        # When deactivating, revoke all active sessions immediately
        if not data.is_active:
            db.query(UserSession).filter(
                UserSession.user_id == target_user.id,
                UserSession.revoked_at.is_(None),
            ).update(
                {"revoked_at": datetime.now(timezone.utc)},
                synchronize_session=False,
            )

    db.commit()
    db.refresh(target_user)

    return UserResponse.model_validate(target_user)


@router.delete(
    "/{user_id}",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.MANAGER)),
):
    """Delete an operator account (Admin and Manager).

    RBAC Rules:
    - Administrators can delete any user except their own account or the last remaining active Administrator.
    - Managers cannot delete Administrator accounts.
    - Last-Admin and Last-Manager protections enforced.
    """
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Operator not found",
        )

    if target_user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account.",
        )

    # Privilege hierarchy protection: Managers cannot delete Administrator accounts
    if target_user.role == UserRole.ADMIN.value and current_user.role != UserRole.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Managers cannot delete Administrator accounts.",
        )

    # Last-Admin protection
    if target_user.role == UserRole.ADMIN.value and target_user.is_active:
        active_admins = (
            db.scalars(
                select(User)
                .where(
                    User.role == UserRole.ADMIN.value,
                    User.is_active.is_(True),
                )
                .order_by(User.id.asc())
                .with_for_update()
            )
            .all()
        )
        if len(active_admins) <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete the last remaining active Administrator.",
            )

    # Last-manager protection: Ensure the organization retains at least one active manager
    if target_user.role == UserRole.MANAGER.value and target_user.is_active:
        active_managers = (
            db.scalars(
                select(User)
                .where(
                    User.role == UserRole.MANAGER.value,
                    User.is_active.is_(True),
                )
                .order_by(User.id.asc())
                .with_for_update()
            )
            .all()
        )
        if len(active_managers) <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete the last remaining active manager.",
            )

    db.delete(target_user)
    db.commit()

    return MessageResponse(message="Operator account deleted successfully")
