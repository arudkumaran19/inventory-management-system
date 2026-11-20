import hashlib
import json
from datetime import datetime, timezone
from typing import Any
from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sequence_number: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False, index=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    actor_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    actor_email: Mapped[str | None] = mapped_column(String(100), nullable=True)
    actor_role: Mapped[str | None] = mapped_column(String(20), nullable=True)
    action: Mapped[str] = mapped_column(String(20), default="EXECUTE", nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    previous_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    record_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    actor = relationship("User", foreign_keys=[actor_id], lazy="joined")

    @staticmethod
    def compute_hash(
        sequence_number: int,
        timestamp: datetime,
        event_type: str,
        actor_email: str | None,
        resource_type: str,
        resource_id: str | None,
        payload: str | None,
        previous_hash: str,
    ) -> str:
        """Compute cryptographic SHA-256 hash for immutable chaining."""
        payload_str = payload or ""
        ts_epoch = int(timestamp.timestamp()) if isinstance(timestamp, datetime) else str(timestamp)
        raw = f"{sequence_number}|{ts_epoch}|{event_type}|{actor_email or ''}|{resource_type}|{resource_id or ''}|{payload_str}|{previous_hash}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()
