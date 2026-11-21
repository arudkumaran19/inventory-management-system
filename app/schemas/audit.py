from datetime import datetime
from pydantic import BaseModel, ConfigDict


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sequence_number: int
    timestamp: datetime
    event_type: str
    actor_id: int | None = None
    actor_email: str | None = None
    actor_role: str | None = None
    action: str
    resource_type: str
    resource_id: str | None = None
    payload: str | None = None
    ip_address: str | None = None
    previous_hash: str
    record_hash: str


class AuditChainVerificationResponse(BaseModel):
    valid: bool
    total_records: int
    latest_sequence: int = 0
    chain_head_hash: str
    verified_at: str
    error: str | None = None
    broken_at_id: int | None = None

