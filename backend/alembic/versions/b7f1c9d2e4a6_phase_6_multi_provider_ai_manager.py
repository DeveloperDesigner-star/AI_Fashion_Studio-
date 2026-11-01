"""phase 6 multi-provider AI manager

Revision ID: b7f1c9d2e4a6
Revises: a2e4b4e63428
Create Date: 2026-10-30 10:30:00.000000+00:00
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "b7f1c9d2e4a6"
down_revision: str | None = "a2e4b4e63428"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("provider_settings", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("priority", sa.Integer(), nullable=False, server_default=sa.text("100"))
        )
        batch_op.add_column(sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("last_test_ok", sa.Boolean(), nullable=True))
        batch_op.add_column(sa.Column("last_test_latency_ms", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("last_test_error", sa.Text(), nullable=True))

    with op.batch_alter_table("ai_requests", schema=None) as batch_op:
        batch_op.alter_column(
            "kind",
            existing_type=sa.String(length=30),
            type_=sa.String(length=40),
            existing_nullable=False,
        )
        batch_op.add_column(sa.Column("estimated_cost_usd", sa.Float(), nullable=True))
        batch_op.add_column(
            sa.Column("attempts", sa.Integer(), nullable=False, server_default=sa.text("0"))
        )
        batch_op.add_column(
            sa.Column(
                "fallback_used", sa.Boolean(), nullable=False, server_default=sa.text("false")
            )
        )

    op.create_table(
        "ai_provider_attempts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("request_id", sa.Uuid(), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("model", sa.String(length=120), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("attempt_no", sa.Integer(), nullable=False),
        sa.Column("retryable", sa.Boolean(), nullable=False),
        sa.Column("error_code", sa.String(length=60), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("latency_ms", sa.Float(), nullable=True),
        sa.Column("prompt_tokens", sa.Integer(), nullable=True),
        sa.Column("completion_tokens", sa.Integer(), nullable=True),
        sa.Column("estimated_cost_usd", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["request_id"], ["ai_requests.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_provider_attempts_request_id", "ai_provider_attempts", ["request_id"])
    op.create_index("ix_ai_provider_attempts_user_id", "ai_provider_attempts", ["user_id"])
    op.create_index("ix_ai_provider_attempts_kind", "ai_provider_attempts", ["kind"])
    op.create_index("ix_ai_provider_attempts_provider", "ai_provider_attempts", ["provider"])
    op.create_index("ix_ai_provider_attempts_status", "ai_provider_attempts", ["status"])
    op.create_index("ix_ai_provider_attempts_created_at", "ai_provider_attempts", ["created_at"])

    op.create_table(
        "ai_fallback_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("from_provider", sa.String(length=20), nullable=False),
        sa.Column("to_provider", sa.String(length=20), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("retryable", sa.Boolean(), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_fallback_events_user_id", "ai_fallback_events", ["user_id"])
    op.create_index("ix_ai_fallback_events_kind", "ai_fallback_events", ["kind"])
    op.create_index("ix_ai_fallback_events_created_at", "ai_fallback_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_ai_fallback_events_created_at", table_name="ai_fallback_events")
    op.drop_index("ix_ai_fallback_events_kind", table_name="ai_fallback_events")
    op.drop_index("ix_ai_fallback_events_user_id", table_name="ai_fallback_events")
    op.drop_table("ai_fallback_events")

    op.drop_index("ix_ai_provider_attempts_created_at", table_name="ai_provider_attempts")
    op.drop_index("ix_ai_provider_attempts_status", table_name="ai_provider_attempts")
    op.drop_index("ix_ai_provider_attempts_provider", table_name="ai_provider_attempts")
    op.drop_index("ix_ai_provider_attempts_kind", table_name="ai_provider_attempts")
    op.drop_index("ix_ai_provider_attempts_user_id", table_name="ai_provider_attempts")
    op.drop_index("ix_ai_provider_attempts_request_id", table_name="ai_provider_attempts")
    op.drop_table("ai_provider_attempts")

    with op.batch_alter_table("ai_requests", schema=None) as batch_op:
        batch_op.drop_column("fallback_used")
        batch_op.drop_column("attempts")
        batch_op.drop_column("estimated_cost_usd")

    with op.batch_alter_table("provider_settings", schema=None) as batch_op:
        batch_op.drop_column("last_test_error")
        batch_op.drop_column("last_test_latency_ms")
        batch_op.drop_column("last_test_ok")
        batch_op.drop_column("last_tested_at")
        batch_op.drop_column("priority")
