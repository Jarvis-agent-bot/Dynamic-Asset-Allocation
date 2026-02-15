"""DAA auth v0: email magic-link tokens + cookie sessions

Revision ID: 20260216_0002
Revises: 20260216_0001
Create Date: 2026-02-16

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# Revision identifiers, used by Alembic.
revision = "20260216_0002"
down_revision = "20260216_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "daa_auth_login_tokens",
        sa.Column("token_id", sa.Text(), primary_key=True),
        sa.Column("created_at", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("secret_hash", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.Text(), nullable=False),
        sa.Column("used_at", sa.Text(), nullable=True),
    )

    op.create_index(
        "idx_daa_auth_login_tokens_email_created_at",
        "daa_auth_login_tokens",
        ["email", "created_at"],
    )
    op.create_index(
        "idx_daa_auth_login_tokens_expires_at",
        "daa_auth_login_tokens",
        ["expires_at"],
    )

    op.create_table(
        "daa_auth_sessions",
        sa.Column("session_id", sa.Text(), primary_key=True),
        sa.Column("created_at", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("secret_hash", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.Text(), nullable=False),
        sa.Column("revoked_at", sa.Text(), nullable=True),
        sa.Column("last_seen_at", sa.Text(), nullable=True),
    )

    op.create_index(
        "idx_daa_auth_sessions_email_created_at",
        "daa_auth_sessions",
        ["email", "created_at"],
    )
    op.create_index(
        "idx_daa_auth_sessions_expires_at",
        "daa_auth_sessions",
        ["expires_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_daa_auth_sessions_expires_at", table_name="daa_auth_sessions")
    op.drop_index("idx_daa_auth_sessions_email_created_at", table_name="daa_auth_sessions")
    op.drop_table("daa_auth_sessions")

    op.drop_index("idx_daa_auth_login_tokens_expires_at", table_name="daa_auth_login_tokens")
    op.drop_index("idx_daa_auth_login_tokens_email_created_at", table_name="daa_auth_login_tokens")
    op.drop_table("daa_auth_login_tokens")
