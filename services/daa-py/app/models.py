from __future__ import annotations

from sqlalchemy import ForeignKey, Index, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class DaaRun(Base):
    __tablename__ = "daa_runs"

    run_id: Mapped[str] = mapped_column(Text, primary_key=True)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[object] = mapped_column(JSONB, nullable=False)

    # Used by the dashboard history filter.
    actor: Mapped[str] = mapped_column(Text, nullable=False, default="unknown")
    source: Mapped[str] = mapped_column(Text, nullable=False, default="")


class DaaRunPortfolio(Base):
    __tablename__ = "daa_run_portfolio"

    run_id: Mapped[str] = mapped_column(Text, ForeignKey("daa_runs.run_id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[object] = mapped_column(JSONB, nullable=False)


class DaaRunConfirm(Base):
    __tablename__ = "daa_run_confirm"

    run_id: Mapped[str] = mapped_column(Text, ForeignKey("daa_runs.run_id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[object] = mapped_column(JSONB, nullable=False)


class DaaRunExecuted(Base):
    __tablename__ = "daa_run_executed"

    run_id: Mapped[str] = mapped_column(Text, ForeignKey("daa_runs.run_id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[object] = mapped_column(JSONB, nullable=False)


class DaaRunAuditEvent(Base):
    __tablename__ = "daa_run_audit_events"

    event_id: Mapped[str] = mapped_column(Text, primary_key=True)
    run_id: Mapped[str] = mapped_column(Text, ForeignKey("daa_runs.run_id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[object] = mapped_column(JSONB, nullable=False)
    actor_user_id: Mapped[str | None] = mapped_column(Text, nullable=True)


Index("idx_daa_runs_created_at", DaaRun.created_at)
Index("idx_daa_runs_actor_created_at", DaaRun.actor, DaaRun.created_at)

Index("idx_daa_run_audit_events_run_created_at", DaaRunAuditEvent.run_id, DaaRunAuditEvent.created_at)
Index(
    "idx_daa_run_audit_events_actor_created_at",
    DaaRunAuditEvent.actor_user_id,
    DaaRunAuditEvent.created_at,
    DaaRunAuditEvent.event_id,
)
