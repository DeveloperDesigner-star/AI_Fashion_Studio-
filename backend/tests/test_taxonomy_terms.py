"""Discovery vocabulary is seeded once and never duplicated."""

from __future__ import annotations

from sqlalchemy import func, select

from app.models.moderation import CatalogTerm
from app.services.taxonomy import ensure_terms


def test_ensure_terms_is_idempotent(db_session) -> None:
    before = db_session.scalar(select(func.count()).select_from(CatalogTerm))
    ensure_terms(db_session)
    ensure_terms(db_session)
    db_session.commit()
    after = db_session.scalar(select(func.count()).select_from(CatalogTerm))
    assert after == before

    rows = db_session.execute(select(CatalogTerm.kind, CatalogTerm.value)).all()
    assert len(rows) == len(set(rows)), "taxonomy terms must be unique per kind and value"
