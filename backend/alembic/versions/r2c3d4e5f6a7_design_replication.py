"""Design replication: reference assets, reviewed blueprints, render jobs.

Additive only. Every new column on ``designs`` is nullable or has a server
default, so existing rows stay valid and no data is rewritten or dropped.

Revision ID: r2c3d4e5f6a7
Revises: q1b2c3d4e5f6
Create Date: 2026-11-06 00:00:00.000000+00:00
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "r2c3d4e5f6a7"
down_revision: str | None = "q1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("designs") as batch:
        batch.add_column(sa.Column("reference_asset_id", sa.Uuid(as_uuid=True), nullable=True))
        batch.add_column(sa.Column("part_references", sa.JSON(), nullable=True))
        batch.add_column(sa.Column("blueprint", sa.JSON(), nullable=True))
        batch.add_column(sa.Column("blueprint_provider", sa.String(length=40), nullable=True))
        batch.add_column(sa.Column("blueprint_model", sa.String(length=80), nullable=True))
        batch.add_column(sa.Column("blueprint_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("target_gender", sa.String(length=20), nullable=True))
        batch.add_column(
            sa.Column(
                "reference_revision",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("0"),
            )
        )
        batch.create_index("ix_designs_reference_asset_id", ["reference_asset_id"])
        batch.create_index("ix_designs_target_gender", ["target_gender"])
        batch.create_foreign_key(
            "fk_designs_reference_asset_id",
            "media_assets",
            ["reference_asset_id"],
            ["id"],
            ondelete="SET NULL",
        )

    op.create_table(
        "design_generations",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "design_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("designs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="queued"),
        sa.Column("kind", sa.String(length=20), nullable=False, server_default="full"),
        sa.Column("parts", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("view", sa.String(length=10), nullable=False, server_default="front"),
        sa.Column("instruction", sa.Text(), nullable=True),
        sa.Column("prompt", sa.Text(), nullable=True),
        sa.Column("provider", sa.String(length=40), nullable=True),
        sa.Column("model_name", sa.String(length=80), nullable=True),
        sa.Column(
            "result_asset_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("media_assets.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("error_code", sa.String(length=40), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("duration_ms", sa.Float(), nullable=True),
        sa.Column(
            "reference_revision", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
    )
    op.create_index("ix_design_generations_user_id", "design_generations", ["user_id"])
    op.create_index("ix_design_generations_design_id", "design_generations", ["design_id"])
    op.create_index("ix_design_generations_status", "design_generations", ["status"])
    op.create_index(
        "ix_design_generations_result_asset_id", "design_generations", ["result_asset_id"]
    )
    # The queue scan is always "oldest queued first", so index the pair.
    op.create_index(
        "ix_design_generations_queue", "design_generations", ["status", "created_at"]
    )


def downgrade() -> None:
    # Dropping this table discards render history, which is why the app never
    # calls it. It exists so a developer database can be reset deliberately.
    op.drop_index("ix_design_generations_queue", table_name="design_generations")
    op.drop_index("ix_design_generations_result_asset_id", table_name="design_generations")
    op.drop_index("ix_design_generations_status", table_name="design_generations")
    op.drop_index("ix_design_generations_design_id", table_name="design_generations")
    op.drop_index("ix_design_generations_user_id", table_name="design_generations")
    op.drop_table("design_generations")

    with op.batch_alter_table("designs") as batch:
        batch.drop_constraint("fk_designs_reference_asset_id", type_="foreignkey")
        batch.drop_index("ix_designs_target_gender")
        batch.drop_index("ix_designs_reference_asset_id")
        batch.drop_column("reference_revision")
        batch.drop_column("target_gender")
        batch.drop_column("blueprint_at")
        batch.drop_column("blueprint_model")
        batch.drop_column("blueprint_provider")
        batch.drop_column("blueprint")
        batch.drop_column("part_references")
        batch.drop_column("reference_asset_id")
