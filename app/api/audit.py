from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.audit_log import AuditLog
from app.models.user import User, UserRole
from app.schemas.audit import AuditChainVerificationResponse, AuditLogResponse
from app.services.audit import AuditService

router = APIRouter(prefix="/audit-logs", tags=["Audit"])


@router.get("", response_model=list[AuditLogResponse])
def get_audit_logs(
    event_type: str | None = Query(None),
    resource_type: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.MANAGER)),
):
    stmt = select(AuditLog)
    if event_type:
        stmt = stmt.where(AuditLog.event_type == event_type)
    if resource_type:
        stmt = stmt.where(AuditLog.resource_type == resource_type)

    stmt = stmt.order_by(desc(AuditLog.sequence_number)).offset(offset).limit(limit)
    return db.execute(stmt).scalars().all()


@router.get("/verify", response_model=AuditChainVerificationResponse)
def verify_audit_chain(
    db: Session = Depends(get_db),
    current_manager: User = Depends(require_role(UserRole.MANAGER)),
):
    return AuditService.verify_chain(db)
