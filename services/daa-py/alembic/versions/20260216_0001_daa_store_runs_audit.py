"""DAA store v0: runs + attachments + audit events

Revision ID: 20260216_0001
Revises:
Create Date: 2026-02-16

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# Revision identifiers, used by Alembic.
revision = "20260216_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "daa_runs",
        sa.Column("run_id", sa.Text(), primary_key=True),
        sa.Column("created_at", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("actor", sa.Text(), nullable=False, server_default="unknown"),
        sa.Column("source", sa.Text(), nullable=False, server_default=""),
    )

    op.create_index("idx_daa_runs_created_at", "daa_runs", ["created_at"])
    op.create_index("idx_daa_runs_actor_created_at", "daa_runs", ["actor", "created_at"])

    op.create_table(
        "daa_run_portfolio",
        sa.Column("run_id", sa.Text(), sa.ForeignKey("daa_runs.run_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    )

    op.create_table(
        "daa_run_confirm",
        sa.Column("run_id", sa.Text(), sa.ForeignKey("daa_runs.run_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    )

    op.create_table(
        "daa_run_executed",
        sa.Column("run_id", sa.Text(), sa.ForeignKey("daa_runs.run_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    )

    op.create_table(
        "daa_run_audit_events",
        sa.Column("event_id", sa.Text(), primary_key=True),
        sa.Column("run_id", sa.Text(), sa.ForeignKey("daa_runs.run_id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("actor_user_id", sa.Text(), nullable=True),
    )

    op.create_index(
        "idx_daa_run_audit_events_run_created_at",
        "daa_run_audit_events",
        ["run_id", "created_at"],
    )
    op.create_index(
        "idx_daa_run_audit_events_actor_created_at",
        "daa_run_audit_events",
        ["actor_user_id", "created_at", "event_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_daa_run_audit_events_actor_created_at", table_name="daa_run_audit_events")
    op.drop_index("idx_daa_run_audit_events_run_created_at", table_name="daa_run_audit_events")
    op.drop_table("daa_run_audit_events")

    op.drop_table("daa_run_executed")
    op.drop_table("daa_run_confirm")
    op.drop_table("daa_run_portfolio")

    op.drop_index("idx_daa_runs_actor_created_at", table_name="daa_runs")
    op.drop_index("idx_daa_runs_created_at", table_name="daa_runs")
    op.drop_table("daa_runs")
