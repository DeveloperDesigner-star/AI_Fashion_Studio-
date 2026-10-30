"""phase 4 design studio layers and revisions

Revision ID: a2e4b4e63428
Revises: f7e18c4bc9ed
Create Date: 2026-10-30 08:33:19.863932+00:00
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = 'a2e4b4e63428'
down_revision: str | None = 'f7e18c4bc9ed'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('designs', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('revision', sa.Integer(), nullable=False, server_default=sa.text('1'))
        )
        batch_op.add_column(sa.Column('source_design_id', sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column('proof_asset_id', sa.Uuid(), nullable=True))
        batch_op.create_index(
            batch_op.f('ix_designs_proof_asset_id'), ['proof_asset_id'], unique=False
        )
        batch_op.create_index(
            batch_op.f('ix_designs_source_design_id'), ['source_design_id'], unique=False
        )
        batch_op.create_foreign_key(
            'fk_designs_source_design_id_designs',
            'designs',
            ['source_design_id'],
            ['id'],
            ondelete='SET NULL',
        )
        batch_op.create_foreign_key(
            'fk_designs_proof_asset_id_media_assets',
            'media_assets',
            ['proof_asset_id'],
            ['id'],
            ondelete='SET NULL',
        )


def downgrade() -> None:
    with op.batch_alter_table('designs', schema=None) as batch_op:
        batch_op.drop_constraint('fk_designs_proof_asset_id_media_assets', type_='foreignkey')
        batch_op.drop_constraint('fk_designs_source_design_id_designs', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_designs_source_design_id'))
        batch_op.drop_index(batch_op.f('ix_designs_proof_asset_id'))
        batch_op.drop_column('proof_asset_id')
        batch_op.drop_column('source_design_id')
        batch_op.drop_column('revision')
