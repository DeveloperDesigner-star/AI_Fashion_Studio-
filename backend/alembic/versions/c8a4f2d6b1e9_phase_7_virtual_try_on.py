"""phase 7 virtual try-on sessions and selections

Revision ID: c8a4f2d6b1e9
Revises: b7f1c9d2e4a6
Create Date: 2026-10-30 14:00:00.000000+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c8a4f2d6b1e9"
down_revision: str | None = "b7f1c9d2e4a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "try_on_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=140), nullable=False),
        sa.Column("mode", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("avatar_id", sa.Uuid(), nullable=True),
        sa.Column("photo_asset_id", sa.Uuid(), nullable=True),
        sa.Column("garment_asset_id", sa.Uuid(), nullable=True),
        sa.Column("result_asset_id", sa.Uuid(), nullable=True),
        sa.Column("preview_asset_id", sa.Uuid(), nullable=True),
        sa.Column("provider", sa.String(length=40), nullable=True),
        sa.Column("model_name", sa.String(length=80), nullable=True),
        sa.Column("model_license", sa.String(length=120), nullable=True),
        sa.Column("model_license_url", sa.String(length=255), nullable=True),
        sa.Column("model_revision", sa.String(length=80), nullable=True),
        sa.Column("inference_ms", sa.Float(), nullable=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "approximate", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column("consent_version", sa.String(length=40), nullable=True),
        sa.Column("consented_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "training_opt_in", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column("metadata_json", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["avatar_id"], ["avatars.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["photo_asset_id"], ["media_assets.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["garment_asset_id"], ["media_assets.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["result_asset_id"], ["media_assets.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["preview_asset_id"], ["media_assets.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_try_on_sessions_user_id", "try_on_sessions", ["user_id"])
    op.create_index("ix_try_on_sessions_mode", "try_on_sessions", ["mode"])
    op.create_index("ix_try_on_sessions_status", "try_on_sessions", ["status"])
    op.create_index("ix_try_on_sessions_avatar_id", "try_on_sessions", ["avatar_id"])
    op.create_index("ix_try_on_sessions_photo_asset_id", "try_on_sessions", ["photo_asset_id"])
    op.create_index(
        "ix_try_on_sessions_garment_asset_id", "try_on_sessions", ["garment_asset_id"]
    )
    op.create_index("ix_try_on_sessions_result_asset_id", "try_on_sessions", ["result_asset_id"])
    op.create_index(
        "ix_try_on_sessions_preview_asset_id", "try_on_sessions", ["preview_asset_id"]
    )

    op.create_table(
        "try_on_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("garment_id", sa.Uuid(), nullable=True),
        sa.Column("design_id", sa.Uuid(), nullable=True),
        sa.Column("garment_name", sa.String(length=140), nullable=False),
        sa.Column("garment_slug", sa.String(length=120), nullable=False),
        sa.Column("design_name", sa.String(length=140), nullable=True),
        sa.Column("slot", sa.String(length=30), nullable=False),
        sa.Column("size", sa.String(length=20), nullable=True),
        sa.Column("fabric", sa.String(length=30), nullable=False),
        sa.Column("color", sa.String(length=9), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.ForeignKeyConstraint(["session_id"], ["try_on_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["garment_id"], ["garments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["design_id"], ["designs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_try_on_items_session_id", "try_on_items", ["session_id"])
    op.create_index("ix_try_on_items_garment_id", "try_on_items", ["garment_id"])
    op.create_index("ix_try_on_items_design_id", "try_on_items", ["design_id"])
    op.create_index("ix_try_on_items_slot", "try_on_items", ["slot"])


def downgrade() -> None:
    op.drop_index("ix_try_on_items_slot", table_name="try_on_items")
    op.drop_index("ix_try_on_items_design_id", table_name="try_on_items")
    op.drop_index("ix_try_on_items_garment_id", table_name="try_on_items")
    op.drop_index("ix_try_on_items_session_id", table_name="try_on_items")
    op.drop_table("try_on_items")

    op.drop_index("ix_try_on_sessions_preview_asset_id", table_name="try_on_sessions")
    op.drop_index("ix_try_on_sessions_result_asset_id", table_name="try_on_sessions")
    op.drop_index("ix_try_on_sessions_garment_asset_id", table_name="try_on_sessions")
    op.drop_index("ix_try_on_sessions_photo_asset_id", table_name="try_on_sessions")
    op.drop_index("ix_try_on_sessions_avatar_id", table_name="try_on_sessions")
    op.drop_index("ix_try_on_sessions_status", table_name="try_on_sessions")
    op.drop_index("ix_try_on_sessions_mode", table_name="try_on_sessions")
    op.drop_index("ix_try_on_sessions_user_id", table_name="try_on_sessions")
    op.drop_table("try_on_sessions")
