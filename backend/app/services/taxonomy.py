"""Database-backed discovery vocabulary for the catalogue.

Built-in categories and styles live in code as enums, but administrators can
rename, hide, reorder and extend them. The first read seeds every built-in into
``catalog_terms``; afterwards the public catalogue and the admin editor both
read the same table. Nothing here changes a garment's stored category value.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.models.catalog import Garment
from app.models.enums import (
    FABRICS,
    FASHION_STYLES,
    GARMENT_FITS,
    OCCASIONS,
    PROFILE_STYLES,
    SEASONS,
    GarmentCategory,
    GarmentSlot,
)
from app.models.moderation import CatalogTerm
from app.models.profile import Profile
from app.services.catalog import (
    CATEGORY_GROUPS,
    OCCASION_LABELS,
    SEASON_LABELS,
    STYLE_LABELS,
    category_label,
)


def _builtin_values(kind: str) -> list[tuple[str, str]]:
    if kind == "category":
        return [(member.value, category_label(member.value)) for member in GarmentCategory]
    if kind == "style":
        return [(style, STYLE_LABELS.get(style, style.replace("_", " ").title())) for style in FASHION_STYLES]
    if kind == "profile_style":
        return [(style, style.replace("_", " ").title()) for style in PROFILE_STYLES]
    raise ValueError(f"Unsupported taxonomy kind: {kind}")


def ensure_terms(db: Session) -> None:
    """Seed any built-in term that is missing. Existing rows are never reset.

    Two first requests can race between the existence check and the insert, so
    the insert is an ``ON CONFLICT DO NOTHING`` against the unique
    ``(kind, value)`` index. That keeps a cold, freshly migrated database free of
    duplicate discovery terms (which React would report as duplicate list keys).
    """

    dialect = db.get_bind().dialect.name
    insert = {"postgresql": postgresql_insert, "sqlite": sqlite_insert}.get(dialect)
    for kind in ("category", "style", "profile_style"):
        existing = set(db.scalars(select(CatalogTerm.value).where(CatalogTerm.kind == kind)).all())
        rows = [
            {
                "kind": kind,
                "value": value,
                "label": label,
                "description": "",
                "is_active": True,
                "is_builtin": True,
                "sort_order": index,
            }
            for index, (value, label) in enumerate(_builtin_values(kind))
            if value not in existing
        ]
        if not rows:
            continue
        if insert is None:  # pragma: no cover - only SQLite and PostgreSQL are supported
            db.add_all([CatalogTerm(**row) for row in rows])
        else:
            db.execute(
                insert(CatalogTerm)
                .values(rows)
                .on_conflict_do_nothing(index_elements=["kind", "value"])
            )
    db.flush()


def group_for(value: str) -> str | None:
    for group in CATEGORY_GROUPS:
        if value in group["categories"]:
            return str(group["label"])
    return None


def terms(db: Session, kind: str, *, include_inactive: bool = True) -> list[CatalogTerm]:
    ensure_terms(db)
    stmt = select(CatalogTerm).where(CatalogTerm.kind == kind)
    if not include_inactive:
        stmt = stmt.where(CatalogTerm.is_active.is_(True))
    return list(db.scalars(stmt.order_by(CatalogTerm.sort_order, CatalogTerm.label)).all())


def allowed_values(db: Session, kind: str) -> set[str]:
    return {term.value for term in terms(db, kind, include_inactive=False)}


def usage_counts(db: Session) -> dict[str, dict[str, int]]:
    category_rows = db.execute(
        select(Garment.category, func.count(Garment.id)).group_by(Garment.category)
    ).all()
    style_rows = db.execute(select(Garment.styles)).all()
    styles: dict[str, int] = {}
    for (values,) in style_rows:
        for value in values or []:
            styles[value] = styles.get(value, 0) + 1
    profile_styles: dict[str, int] = {}
    for (values,) in db.execute(select(Profile.fashion_styles)).all():
        for value in values or []:
            profile_styles[value] = profile_styles.get(value, 0) + 1
    return {
        "category": {row[0]: int(row[1]) for row in category_rows},
        "style": styles,
        "profile_style": profile_styles,
    }


def payload(db: Session, counts: dict[str, int] | None = None) -> dict[str, Any]:
    """Public discovery vocabulary, filtered to active admin-managed terms."""

    ensure_terms(db)
    active_categories = terms(db, "category", include_inactive=False)
    active_styles = terms(db, "style", include_inactive=False)
    counts = counts or {}
    known = {term.value for term in active_categories}

    groups: list[dict[str, Any]] = []
    grouped: set[str] = set()
    for group in CATEGORY_GROUPS:
        members = [value for value in group["categories"] if value in known]
        if not members:
            continue
        grouped.update(members)
        groups.append(
            {
                **{key: value for key, value in group.items() if key != "categories"},
                "categories": [
                    {
                        "value": value,
                        "label": next(term.label for term in active_categories if term.value == value),
                        "count": counts.get(value, 0),
                    }
                    for value in members
                ],
            }
        )
    extras = [
        term for term in active_categories if not term.is_builtin and term.value not in grouped
    ]
    if extras:
        groups.append(
            {
                "id": "more",
                "label": "More categories",
                "description": "Additional categories managed in the admin dashboard.",
                "categories": [
                    {"value": term.value, "label": term.label, "count": counts.get(term.value, 0)}
                    for term in extras
                ],
            }
        )

    return {
        "genders": ["womenswear", "menswear", "unisex"],
        "categories": [
            {"value": term.value, "label": term.label, "count": counts.get(term.value, 0)}
            for term in active_categories
        ],
        "category_groups": groups,
        "slots": [member.value for member in GarmentSlot],
        "styles": [
            {"value": term.value, "label": term.label, "count": counts.get(term.value, 0)}
            for term in active_styles
        ],
        "occasions": [
            {"value": occasion, "label": OCCASION_LABELS.get(occasion, occasion)}
            for occasion in OCCASIONS
        ],
        "seasons": [
            {"value": season, "label": SEASON_LABELS.get(season, season)} for season in SEASONS
        ],
        "fits": list(GARMENT_FITS),
        "fabrics": list(FABRICS),
    }
