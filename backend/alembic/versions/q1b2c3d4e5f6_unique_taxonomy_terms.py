"""Make discovery vocabulary unique per kind and value.

Revision ID: q1b2c3d4e5f6
Revises: p9a1b2c3d4e5
Create Date: 2026-11-01 00:00:00.000000+00:00
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "q1b2c3d4e5f6"
down_revision: str | None = "p9a1b2c3d4e5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEX = "uq_catalog_terms_kind_value"


def _remove_duplicates() -> None:
    """Keep the oldest row for each (kind, value) before adding the unique index."""

    bind = op.get_bind()
    duplicates = bind.execute(
        sa.text(
            "SELECT kind, value FROM catalog_terms "
            "GROUP BY kind, value HAVING COUNT(*) > 1"
        )
    ).all()
    for kind, value in duplicates:
        ids = bind.execute(
            sa.text(
                "SELECT id FROM catalog_terms WHERE kind = :kind AND value = :value "
                "ORDER BY created_at, id"
            ),
            {"kind": kind, "value": value},
        ).scalars().all()
        for duplicate_id in ids[1:]:
            bind.execute(
                sa.text("DELETE FROM catalog_terms WHERE id = :id"), {"id": duplicate_id}
            )


def upgrade() -> None:
    _remove_duplicates()
    op.create_index(INDEX, "catalog_terms", ["kind", "value"], unique=True)


def downgrade() -> None:
    op.drop_index(INDEX, table_name="catalog_terms")
