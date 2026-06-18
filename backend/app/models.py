from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Report(Base):
    """A crowdsourced 'something is wrong' signal from a visitor."""

    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, index=True
    )
    isp: Mapped[str] = mapped_column(String(64), index=True)
    wilaya: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    issue_type: Mapped[str] = mapped_column(String(32))
    asn: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Salted hash of the visitor IP. Raw IPs are never stored.
    ip_hash: Mapped[str] = mapped_column(String(64), index=True)


class Measurement(Base):
    """An automatic in-browser connectivity probe result."""

    __tablename__ = "measurements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, index=True
    )
    isp: Mapped[str] = mapped_column(String(64), index=True)
    wilaya: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    latency_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    dns_ok: Mapped[bool] = mapped_column(Boolean, default=True)
    reachable: Mapped[bool] = mapped_column(Boolean, default=True)
    asn: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ip_hash: Mapped[str] = mapped_column(String(64), index=True)
