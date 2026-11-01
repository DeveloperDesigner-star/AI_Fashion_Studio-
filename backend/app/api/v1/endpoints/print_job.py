"""Print packages: preparation, review/approval and manual export.

Hard constraint: this API never claims to talk to a printer. It produces files
for manual hand-off; printer/RIP integrations can only be added once a real,
tested protocol is available.
"""

from __future__ import annotations

import io
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from fastapi.responses import FileResponse
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import CurrentUser, DbSession
from app.core.config import settings
from app.models.business import Business, QuoteRequest
from app.models.design import Design
from app.models.enums import PrintPackageStatus, ProductionStatus, UserRole
from app.models.media import MediaAsset
from app.models.print_job import PrintFile, PrintPackage
from app.schemas.print_job import (
    PrintExportResponse,
    PrintFileRead,
    PrintPackageCreate,
    PrintPackageListResponse,
    PrintPackageRead,
)
from app.services import audit, print_jobs, storage
from app.services.orders import TransitionError, actor_role, transition

router = APIRouter(prefix="/print", tags=["print"])

EDITABLE = {PrintPackageStatus.DRAFT.value, PrintPackageStatus.CHANGES_REQUESTED.value}


def _url(path: str) -> str:
    return f"{settings.api_v1_prefix}{path}"


def _file_read(package: PrintPackage, file: PrintFile) -> PrintFileRead:
    data = PrintFileRead.model_validate(file)
    base = _url(f"/print/packages/{package.id}/files/{file.id}")
    data.content_url = base
    data.preview_url = f"{base}?preview=true"
    return data


def _read(package: PrintPackage) -> PrintPackageRead:
    data = PrintPackageRead.model_validate(package)
    data.files = [_file_read(package, file) for file in package.files]
    data.pdf_url = _url(f"/print/packages/{package.id}/download?format=pdf") if package.pdf_asset_id else None
    data.zip_url = _url(f"/print/packages/{package.id}/download?format=zip") if package.zip_asset_id else None
    return data


def _package_query():
    return select(PrintPackage).options(selectinload(PrintPackage.files))


def _business_ids(db, user) -> list[uuid.UUID]:
    return list(db.scalars(select(Business.id).where(Business.owner_id == user.id)).all())


def _package_access(db, user, package: PrintPackage) -> str:
    """Return ``owner`` / ``business`` / ``admin``; raise 403 otherwise."""

    if user.role == UserRole.ADMIN:
        return "admin"
    if package.user_id == user.id:
        return "owner"
    owned = _business_ids(db, user)
    if owned:
        linked = db.scalar(
            select(QuoteRequest.id).where(
                QuoteRequest.print_package_id == package.id, QuoteRequest.business_id.in_(owned)
            ).limit(1)
        )
        if linked:
            return "business"
    raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "This print package is not shared with you."})


def _owned_package(db, user, package_id: uuid.UUID) -> PrintPackage:
    package = db.scalar(_package_query().where(PrintPackage.id == package_id))
    if package is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Print package not found."})
    role = _package_access(db, user, package)
    if role not in {"owner", "admin"}:
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Only the owner can change this package."})
    return package


def _get_accessible(db, user, package_id: uuid.UUID) -> PrintPackage:
    package = db.scalar(_package_query().where(PrintPackage.id == package_id))
    if package is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Print package not found."})
    _package_access(db, user, package)
    return package


@router.get("/capabilities")
def print_capabilities() -> dict:
    """What this build actually supports — no aspirational printer claims."""

    return {
        "dpi": {"min": print_jobs.MIN_DPI, "max": 600, "recommended": print_jobs.RECOMMENDED_DPI},
        "color_profiles": ["srgb", "source"],
        "color_management": "Pillow/ImageCms local conversion; no press soft-proofing.",
        "transparent_background": True,
        "exports": ["pdf", "png_zip"],
        "pdf": "Local PDF writer, exact physical page size, alpha preserved via SMask.",
        "component_files": True,
        "printer_connection": False,
        "printer_integrations": [],
        "integration_mode": "manual_export_import",
        "note": (
            "Print packages are exported for manual hand-off. No direct printer, RIP or driver "
            "integration is implemented or claimed."
        ),
    }


@router.post("/packages", response_model=PrintPackageRead, status_code=status.HTTP_201_CREATED)
def create_package(
    payload: PrintPackageCreate, user: CurrentUser, db: DbSession, request: Request
) -> PrintPackageRead:
    design = db.scalar(select(Design).where(Design.id == payload.design_id, Design.user_id == user.id))
    if design is None:
        raise HTTPException(status_code=404, detail={"code": "design_not_found", "message": "Design not found."})

    package = PrintPackage(
        user_id=user.id,
        design_id=design.id,
        name=payload.name.strip(),
        status=PrintPackageStatus.DRAFT.value,
        width_cm=payload.width_cm,
        height_cm=payload.height_cm,
        bleed_mm=payload.bleed_mm,
        dpi=payload.dpi,
        color_profile=payload.color_profile,
        transparent_background=payload.transparent_background,
        notes=payload.notes,
    )
    db.add(package)
    db.flush()
    specs = [spec.model_dump() for spec in payload.components]
    try:
        print_jobs.build_package(db, user_id=user.id, package=package, design=design, specs=specs)
    except print_jobs.PrintPrepError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail={"code": exc.code, "message": exc.message}) from exc
    audit.record(
        db,
        action="print.package_created",
        user=user,
        request=request,
        resource_type="print_package",
        resource_id=package.id,
        detail={"files": len(package.files), "dpi": package.dpi},
    )
    db.commit()
    db.refresh(package)
    package = db.scalar(_package_query().where(PrintPackage.id == package.id))
    assert package is not None
    return _read(package)


@router.get("/packages", response_model=PrintPackageListResponse)
def list_packages(
    user: CurrentUser,
    db: DbSession,
    scope: str = Query(default="mine", pattern=r"^(mine|shared)$"),
) -> PrintPackageListResponse:
    if scope == "shared":
        owned = _business_ids(db, user)
        if not owned:
            return PrintPackageListResponse(items=[], total=0)
        ids = select(QuoteRequest.print_package_id).where(
            QuoteRequest.business_id.in_(owned), QuoteRequest.print_package_id.is_not(None)
        )
        rows = db.scalars(
            _package_query().where(PrintPackage.id.in_(ids)).order_by(PrintPackage.created_at.desc())
        ).all()
    else:
        rows = db.scalars(
            _package_query().where(PrintPackage.user_id == user.id).order_by(PrintPackage.created_at.desc())
        ).all()
    return PrintPackageListResponse(items=[_read(row) for row in rows], total=len(rows))


@router.get("/packages/{package_id}", response_model=PrintPackageRead)
def get_package(package_id: uuid.UUID, user: CurrentUser, db: DbSession) -> PrintPackageRead:
    return _read(_get_accessible(db, user, package_id))


def _rebuild(db, package: PrintPackage) -> None:
    design = db.get(Design, package.design_id) if package.design_id else None
    if design is None:
        raise HTTPException(status_code=409, detail={"code": "design_missing", "message": "The source design no longer exists."})
    specs = list((package.manifest or {}).get("components") or [])
    try:
        print_jobs.build_package(db, user_id=package.user_id, package=package, design=design, specs=specs)
    except print_jobs.PrintPrepError as exc:
        raise HTTPException(status_code=422, detail={"code": exc.code, "message": exc.message}) from exc


@router.post("/packages/{package_id}/rebuild", response_model=PrintPackageRead)
def rebuild_package(package_id: uuid.UUID, user: CurrentUser, db: DbSession, request: Request) -> PrintPackageRead:
    package = _owned_package(db, user, package_id)
    if package.status not in EDITABLE:
        raise HTTPException(status_code=409, detail={"code": "locked", "message": "Approved packages cannot be rebuilt."})
    _rebuild(db, package)
    audit.record(db, action="print.package_rebuilt", user=user, request=request,
                 resource_type="print_package", resource_id=package.id)
    db.commit()
    row = db.scalar(_package_query().where(PrintPackage.id == package.id))
    assert row is not None
    return _read(row)


@router.post("/packages/{package_id}/submit", response_model=PrintPackageRead)
def submit_package(package_id: uuid.UUID, user: CurrentUser, db: DbSession, request: Request) -> PrintPackageRead:
    package = _owned_package(db, user, package_id)
    if package.status not in EDITABLE:
        raise HTTPException(status_code=409, detail={"code": "bad_status", "message": "Only drafts or packages with changes requested can be submitted."})
    package.status = PrintPackageStatus.IN_REVIEW.value
    package.rejection_reason = None
    audit.record(db, action="print.package_submitted", user=user, request=request,
                 resource_type="print_package", resource_id=package.id)
    db.commit()
    return _read(db.scalar(_package_query().where(PrintPackage.id == package.id)))


@router.post("/packages/{package_id}/approve", response_model=PrintPackageRead)
def approve_package(package_id: uuid.UUID, user: CurrentUser, db: DbSession, request: Request) -> PrintPackageRead:
    package = _owned_package(db, user, package_id)
    if package.status != PrintPackageStatus.IN_REVIEW.value:
        raise HTTPException(status_code=409, detail={"code": "bad_status", "message": "Only packages in review can be approved."})
    package.status = PrintPackageStatus.APPROVED.value
    package.rejection_reason = None
    from datetime import UTC, datetime

    package.approved_at = datetime.now(UTC)
    package.approved_by_id = user.id

    # Approving the artwork is the design approval step of the linked order.
    orders = db.scalars(select(QuoteRequest).where(QuoteRequest.print_package_id == package.id)).all()
    for order in orders:
        if order.production_status != ProductionStatus.QUOTE_APPROVED.value:
            continue
        try:
            transition(db, order, ProductionStatus.DESIGN_APPROVED, role=actor_role(user, order, False),
                       actor_id=user.id, note="Print artwork approved.")
        except TransitionError:
            continue
    audit.record(db, action="print.package_approved", user=user, request=request,
                 resource_type="print_package", resource_id=package.id)
    db.commit()
    return _read(db.scalar(_package_query().where(PrintPackage.id == package.id)))


@router.post("/packages/{package_id}/request-changes", response_model=PrintPackageRead)
def request_changes(
    package_id: uuid.UUID, payload: dict, user: CurrentUser, db: DbSession, request: Request
) -> PrintPackageRead:
    package = _owned_package(db, user, package_id)
    if package.status != PrintPackageStatus.IN_REVIEW.value:
        raise HTTPException(status_code=409, detail={"code": "bad_status", "message": "Only packages in review can be sent back."})
    reason = str(payload.get("reason") or "").strip()
    if len(reason) < 4:
        raise HTTPException(status_code=422, detail={"code": "reason_required", "message": "Explain what needs changing."})
    package.status = PrintPackageStatus.CHANGES_REQUESTED.value
    package.rejection_reason = reason[:2000]
    audit.record(db, action="print.package_changes_requested", user=user, request=request,
                 resource_type="print_package", resource_id=package.id)
    db.commit()
    return _read(db.scalar(_package_query().where(PrintPackage.id == package.id)))


@router.post("/packages/{package_id}/export", response_model=PrintExportResponse)
def export_package(
    package_id: uuid.UUID, payload: dict, user: CurrentUser, db: DbSession, request: Request
) -> PrintExportResponse:
    package = _get_accessible(db, user, package_id)
    fmt = str(payload.get("format") or "pdf")
    if fmt not in {"pdf", "zip", "png_zip"}:
        raise HTTPException(status_code=422, detail={"code": "bad_format", "message": "Use pdf or png_zip."})
    asset_id = package.zip_asset_id if fmt in {"zip", "png_zip"} else package.pdf_asset_id
    if asset_id is None:
        raise HTTPException(status_code=409, detail={"code": "not_ready", "message": "The export is not ready yet."})
    asset = db.get(MediaAsset, asset_id)
    if asset is None:
        raise HTTPException(status_code=410, detail={"code": "file_missing", "message": "The export file is missing."})
    audit.record(db, action="print.package_exported", user=user, request=request,
                 resource_type="print_package", resource_id=package.id, detail={"format": fmt})
    db.commit()
    normalised = "png_zip" if fmt in {"zip", "png_zip"} else "pdf"
    return PrintExportResponse(
        format=normalised,
        filename=asset.original_filename,
        download_url=_url(f"/print/packages/{package.id}/download?format={'zip' if normalised == 'png_zip' else 'pdf'}"),
        meta={"printer_connection": "none", "handoff": "manual", **(package.manifest or {})},
    )


@router.get("/packages/{package_id}/download")
def download_package(
    package_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    format: str = Query(default="pdf", pattern=r"^(pdf|zip)$"),
) -> FileResponse:
    package = _get_accessible(db, user, package_id)
    asset_id = package.zip_asset_id if format == "zip" else package.pdf_asset_id
    if asset_id is None:
        raise HTTPException(status_code=404, detail={"code": "not_ready", "message": "That export has not been generated."})
    asset = db.get(MediaAsset, asset_id)
    if asset is None:
        raise HTTPException(status_code=410, detail={"code": "file_missing", "message": "The export file is missing."})
    path: Path = storage.path_for(asset.storage_key)
    if not path.exists():
        raise HTTPException(status_code=410, detail={"code": "file_missing", "message": "The export file is missing on disk."})
    return FileResponse(
        path,
        media_type=asset.mime_type,
        filename=asset.original_filename,
        headers={"Cache-Control": "private, no-store"},
    )


@router.get("/packages/{package_id}/files/{file_id}")
def component_file(
    package_id: uuid.UUID,
    file_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    preview: bool = Query(default=False),
) -> Response:
    package = _get_accessible(db, user, package_id)
    file = db.scalar(select(PrintFile).where(PrintFile.id == file_id, PrintFile.package_id == package.id))
    if file is None or file.asset_id is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Print file not found."})
    asset = db.get(MediaAsset, file.asset_id)
    if asset is None:
        raise HTTPException(status_code=410, detail={"code": "file_missing", "message": "The print file is missing."})
    path = storage.path_for(asset.storage_key)
    if not path.exists():
        raise HTTPException(status_code=410, detail={"code": "file_missing", "message": "The print file is missing on disk."})
    if preview:
        with Image.open(path) as image:
            thumb = image.copy()
        thumb.thumbnail((900, 900), Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        thumb.save(buffer, format="PNG", optimize=True)
        return Response(content=buffer.getvalue(), media_type="image/png", headers={"Cache-Control": "private, max-age=120"})
    return FileResponse(
        path,
        media_type="image/png",
        filename=f"{file.component_id}.png",
        headers={"Cache-Control": "private, no-store"},
    )
