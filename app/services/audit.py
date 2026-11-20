import json
from datetime import datetime, timezone
from typing import Any
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.user import User

GENESIS_HASH = "0" * 64


class AuditService:
    @staticmethod
    def log_event(
        db: Session,
        event_type: str,
        resource_type: str,
        actor: User | None = None,
        resource_id: str | int | None = None,
        action: str = "EXECUTE",
        payload: dict[str, Any] | str | None = None,
        ip_address: str | None = None,
    ) -> AuditLog:
        """Create an append-only, cryptographically chained audit log entry."""
        # Find latest sequence number and hash
        latest = db.execute(
            select(AuditLog).order_by(desc(AuditLog.sequence_number)).limit(1)
        ).scalar_one_or_none()

        next_sequence = (latest.sequence_number + 1) if latest else 1
        previous_hash = latest.record_hash if latest else GENESIS_HASH

        now = datetime.now(timezone.utc)
        payload_str = json.dumps(payload) if isinstance(payload, dict) else (payload or None)
        actor_email = actor.email if actor else None
        actor_role = actor.role if actor else None
        actor_id = actor.id if actor else None
        res_id_str = str(resource_id) if resource_id is not None else None

        record_hash = AuditLog.compute_hash(
            sequence_number=next_sequence,
            timestamp=now,
            event_type=event_type,
            actor_email=actor_email,
            resource_type=resource_type,
            resource_id=res_id_str,
            payload=payload_str,
            previous_hash=previous_hash,
        )

        entry = AuditLog(
            sequence_number=next_sequence,
            timestamp=now,
            event_type=event_type,
            actor_id=actor_id,
            actor_email=actor_email,
            actor_role=actor_role,
            action=action,
            resource_type=resource_type,
            resource_id=res_id_str,
            payload=payload_str,
            ip_address=ip_address,
            previous_hash=previous_hash,
            record_hash=record_hash,
        )

        db.add(entry)
        db.flush()
        return entry

    @staticmethod
    def verify_chain(db: Session) -> dict[str, Any]:
        """Verify the entire cryptographic SHA-256 chain of audit logs."""
        logs = db.execute(
            select(AuditLog).order_by(AuditLog.sequence_number.asc())
        ).scalars().all()

        if not logs:
            return {
                "valid": True,
                "total_records": 0,
                "latest_sequence": 0,
                "chain_head_hash": GENESIS_HASH,
                "verified_at": datetime.now(timezone.utc).isoformat(),
            }

        expected_prev = GENESIS_HASH
        for i, log in enumerate(logs):
            expected_seq = i + 1
            if log.sequence_number != expected_seq:
                return {
                    "valid": False,
                    "error": f"Sequence break: expected sequence #{expected_seq}, found #{log.sequence_number}",
                    "broken_at_id": log.id,
                    "total_records": len(logs),
                    "latest_sequence": logs[-1].sequence_number if logs else 0,
                    "chain_head_hash": logs[-1].record_hash if logs else GENESIS_HASH,
                    "verified_at": datetime.now(timezone.utc).isoformat(),
                }

            if log.previous_hash != expected_prev:
                return {
                    "valid": False,
                    "error": f"Hash chain break at sequence #{log.sequence_number}: previous_hash mismatch.",
                    "broken_at_id": log.id,
                    "total_records": len(logs),
                    "latest_sequence": logs[-1].sequence_number if logs else 0,
                    "chain_head_hash": logs[-1].record_hash if logs else GENESIS_HASH,
                    "verified_at": datetime.now(timezone.utc).isoformat(),
                }

            recomputed = AuditLog.compute_hash(
                sequence_number=log.sequence_number,
                timestamp=log.timestamp,
                event_type=log.event_type,
                actor_email=log.actor_email,
                resource_type=log.resource_type,
                resource_id=log.resource_id,
                payload=log.payload,
                previous_hash=log.previous_hash,
            )

            if log.record_hash != recomputed:
                return {
                    "valid": False,
                    "error": f"Hash signature tamper detected at sequence #{log.sequence_number}: computed {recomputed} != stored {log.record_hash}",
                    "broken_at_id": log.id,
                    "total_records": len(logs),
                    "latest_sequence": logs[-1].sequence_number if logs else 0,
                    "chain_head_hash": logs[-1].record_hash if logs else GENESIS_HASH,
                    "verified_at": datetime.now(timezone.utc).isoformat(),
                }

            expected_prev = log.record_hash

        return {
            "valid": True,
            "total_records": len(logs),
            "latest_sequence": logs[-1].sequence_number,
            "chain_head_hash": logs[-1].record_hash,
            "verified_at": datetime.now(timezone.utc).isoformat(),
        }
