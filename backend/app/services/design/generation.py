"""Asynchronous design rendering: queue, claim, run, record.

Rendering an image takes long enough that holding an HTTP request open is the
wrong shape, so a render is a *job*:

1. ``create_render`` validates the request and writes a ``queued`` row.
2. ``run_render`` claims the row atomically, calls the image model, stores the
   result as a private asset and writes a terminal status.

Claiming is a conditional UPDATE, so two workers (or a retry racing an original)
can never both render the same job. A job whose process died stays ``queued``;
the status endpoint reports it as stalled after a grace period rather than
pretending it is still working.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.design import Design, DesignGeneration
from app.models.enums import MediaKind
from app.models.media import MediaAsset
from app.services import storage
from app.services.design import imagegen
from app.services.design.blueprint import Blueprint, parse_blueprint
from app.services.design.prompting import build_render_prompt

logger = logging.getLogger(__name__)

STALL_AFTER_SECONDS = 180
MAX_INSTRUCTION = 600
VALID_VIEWS = {"front", "back"}


class RenderError(Exception):
    def __init__(self, code: str, message: str, *, status_code: int = 422) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def _blueprint_of(design: Design) -> Blueprint | None:
    if not design.blueprint:
        return None
    try:
        return parse_blueprint(design.blueprint)
    except (ValueError, TypeError):
        # A stored blueprint that no longer parses is treated as absent rather
        # than as a source of half-valid attributes.
        logger.warning("design %s has an unreadable blueprint; ignoring", design.id)
        return None


def _reference_assets(db: Session, design: Design) -> list[MediaAsset]:
    ids: list[uuid.UUID] = []
    if design.reference_asset_id:
        ids.append(design.reference_asset_id)
    for value in (design.part_references or {}).values():
        if isinstance(value, str):
            try:
                ids.append(uuid.UUID(value))
            except ValueError:
                continue
    if not ids:
        return []
    assets = db.scalars(select(MediaAsset).where(MediaAsset.id.in_(ids))).all()
    by_id = {asset.id: asset for asset in assets}
    ordered = [by_id[i] for i in ids if i in by_id]
    return ordered[: settings.design_max_references_per_design]


def _read_assets(assets: list[MediaAsset]) -> list[tuple[bytes, str]]:
    payload: list[tuple[bytes, str]] = []
    for asset in assets:
        path = storage.path_for(asset.storage_key)
        if not path.exists():
            logger.warning("reference asset %s is missing from storage", asset.id)
            continue
        payload.append((path.read_bytes(), asset.mime_type))
    return payload


def recent_render_count(db: Session, user_id: uuid.UUID) -> int:
    since = datetime.now(UTC) - timedelta(hours=1)
    return (
        db.scalar(
            select(func.count(DesignGeneration.id)).where(
                DesignGeneration.user_id == user_id,
                DesignGeneration.created_at >= since,
            )
        )
        or 0
    )


def create_render(
    db: Session,
    *,
    design: Design,
    kind: str = "full",
    parts: list[str] | None = None,
    view: str = "front",
    instruction: str | None = None,
) -> DesignGeneration:
    """Queue a render. Raises :class:`RenderError` when it cannot be honoured."""

    usable, reason = imagegen.availability()
    if not usable:
        raise RenderError("generation_unavailable", reason, status_code=503)
    if not design.reference_asset_id:
        raise RenderError(
            "reference_required",
            "Upload a reference image before rendering a design.",
        )
    if view not in VALID_VIEWS:
        raise RenderError("bad_view", "A render is either a front or a back view.")
    if kind not in {"full", "parts"}:
        raise RenderError("bad_kind", "A render is either a full render or a part render.")

    cleaned_parts = [part for part in (parts or []) if part][:12]
    if kind == "parts" and not cleaned_parts:
        raise RenderError(
            "parts_required", "Choose at least one part to regenerate."
        )

    allowed_parts = {component.get("id") for component in (design.garment.components or [])}
    unknown = [part for part in cleaned_parts if part not in allowed_parts]
    if unknown:
        raise RenderError(
            "unknown_part",
            f"This garment has no component(s): {', '.join(unknown)}.",
        )

    if recent_render_count(db, design.user_id) >= settings.design_max_generations_per_hour:
        raise RenderError(
            "render_quota",
            "This account has reached the hourly render limit "
            f"({settings.design_max_generations_per_hour}). Try again later.",
            status_code=429,
        )

    blueprint = _blueprint_of(design)
    prompt = build_render_prompt(
        garment_name=design.garment.name,
        garment_category=design.garment.category,
        silhouette=design.garment.silhouette,
        gender=design.target_gender,
        blueprint=blueprint,
        components=design.components,
        parts=cleaned_parts if kind == "parts" else None,
        view=view,
        instruction=instruction,
        has_part_references=bool(design.part_references),
    )

    job = DesignGeneration(
        user_id=design.user_id,
        design_id=design.id,
        status="queued",
        kind=kind,
        view=view,
        parts=cleaned_parts,
        instruction=(instruction or "").strip()[:MAX_INSTRUCTION] or None,
        prompt=prompt,
        reference_revision=design.reference_revision,
    )
    db.add(job)
    db.flush()
    return job


def _claim(db: Session, job_id: uuid.UUID) -> bool:
    """Atomically move a queued job to running. False when someone else won."""

    result = db.execute(
        update(DesignGeneration)
        .where(DesignGeneration.id == job_id, DesignGeneration.status == "queued")
        .values(status="running", started_at=datetime.now(UTC))
    )
    db.flush()
    return bool(result.rowcount)


def _finish(
    db: Session,
    job: DesignGeneration,
    *,
    status: str,
    error_code: str | None = None,
    error: str | None = None,
    asset_id: uuid.UUID | None = None,
    duration_ms: float | None = None,
) -> None:
    job.status = status
    job.error_code = error_code
    job.error = error
    job.result_asset_id = asset_id
    job.duration_ms = duration_ms
    job.finished_at = datetime.now(UTC)
    db.flush()


def _store_render(
    db: Session, *, job: DesignGeneration, design: Design, data: bytes, mime_type: str
) -> MediaAsset:
    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}.get(mime_type, "png")
    filename = f"design-{design.id.hex[:8]}-{job.view}-{job.id.hex[:6]}.{ext}"
    stored = storage.save_image(
        data=data,
        original_filename=filename,
        kind=MediaKind.DESIGN_RENDER.value,
        make_thumbnail=True,
    )
    asset = MediaAsset(
        user_id=design.user_id,
        kind=MediaKind.DESIGN_RENDER.value,
        original_filename=filename,
        storage_key=stored.storage_key,
        thumbnail_key=stored.thumbnail_key,
        mime_type=stored.mime_type,
        byte_size=stored.byte_size,
        width=stored.width,
        height=stored.height,
        checksum_sha256=stored.checksum_sha256,
        # A render contains the user's own reference design; it is private.
        is_private=True,
    )
    db.add(asset)
    db.flush()
    return asset


async def run_render(db: Session, job_id: uuid.UUID) -> None:
    """Execute one queued job. Safe to call twice: the second call no-ops."""

    job = db.get(DesignGeneration, job_id)
    if job is None:
        return
    if not _claim(db, job.id):
        return
    db.commit()

    design = db.get(Design, job.design_id)
    if design is None:
        _finish(db, job, status="failed", error_code="design_missing", error="Design was deleted.")
        db.commit()
        return

    if design.reference_revision != job.reference_revision:
        _finish(
            db,
            job,
            status="failed",
            error_code="reference_changed",
            error="The reference image changed after this render was queued. Start a new render.",
        )
        db.commit()
        return

    assets = _reference_assets(db, design)
    payload = _read_assets(assets)
    if not payload:
        _finish(
            db,
            job,
            status="failed",
            error_code="reference_missing",
            error="The reference image could not be read from storage.",
        )
        db.commit()
        return

    try:
        rendered = await imagegen.generate_design_image(
            prompt=job.prompt or "",
            references=payload,
        )
    except imagegen.GenerationUnavailable as exc:
        _finish(db, job, status="unavailable", error_code=exc.code, error=exc.message)
        db.commit()
        return
    except imagegen.GenerationError as exc:
        _finish(db, job, status="failed", error_code=exc.code, error=exc.message)
        db.commit()
        return
    except Exception as exc:  # noqa: BLE001 - never let a worker crash silently
        logger.exception("design render crashed: %s", type(exc).__name__)
        _finish(
            db,
            job,
            status="failed",
            error_code="worker_error",
            error="The render failed unexpectedly. It is safe to retry.",
        )
        db.commit()
        return

    try:
        asset = _store_render(
            db, job=job, design=design, data=rendered.data, mime_type=rendered.mime_type
        )
    except storage.UploadError as exc:
        _finish(db, job, status="failed", error_code="storage_error", error=exc.message)
        db.commit()
        return

    job.provider = rendered.provider
    job.model_name = rendered.model
    _finish(db, job, status="succeeded", asset_id=asset.id, duration_ms=rendered.latency_ms)
    db.commit()
    logger.info(
        "design render %s succeeded in %.0f ms via %s", job.id, rendered.latency_ms, rendered.provider
    )


def job_read(job: DesignGeneration) -> dict[str, Any]:
    stalled = False
    if job.status == "queued" and job.created_at is not None:
        created = job.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=UTC)
        stalled = (datetime.now(UTC) - created).total_seconds() > STALL_AFTER_SECONDS
    return {
        "id": str(job.id),
        "design_id": str(job.design_id),
        "status": job.status,
        "kind": job.kind,
        "view": job.view,
        "parts": list(job.parts or []),
        "instruction": job.instruction,
        "provider": job.provider,
        "model": job.model_name,
        "result_asset_id": str(job.result_asset_id) if job.result_asset_id else None,
        "error_code": job.error_code,
        "error": job.error,
        "duration_ms": job.duration_ms,
        "reference_revision": job.reference_revision,
        "stalled": stalled,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
    }
