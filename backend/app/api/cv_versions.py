"""CV versions API: upload, list, preview."""

import re
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models import CVVersion, User
from app.services import storage

router = APIRouter(prefix="/api/cv-versions", tags=["cv-versions"])

ALLOWED_EXTENSIONS = {".pdf", ".docx"}
MAX_SIZE = 10 * 1024 * 1024  # 10 MB


def _check_file(file: UploadFile) -> tuple[str, str]:
    """Return (filename, ext) or raise."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename")
    path = Path(file.filename)
    ext = path.suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Only PDF and DOCX allowed. Got: {ext}",
        )
    # Sanitise filename
    safe = re.sub(r"[^\w\-.]", "_", path.stem)[:100] + ext
    return safe, ext[1:]  # ext without dot


@router.get("")
def list_cv_versions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List CV versions for the current user."""
    return (
        db.query(CVVersion)
        .filter(CVVersion.user_id == current_user.id)
        .order_by(CVVersion.created_at.desc())
        .all()
    )


@router.post("", status_code=201)
def upload_cv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a CV (PDF or DOCX)."""
    filename, file_type = _check_file(file)
    content = file.file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 10 MB)")

    file_path = storage.save_cv(current_user.id, filename, content)
    cv = CVVersion(
        user_id=current_user.id,
        name=Path(file.filename or filename).stem,
        file_path=file_path,
        file_type=file_type,
    )
    db.add(cv)
    db.commit()
    db.refresh(cv)
    return cv


@router.get("/{cv_id}/file")
def get_cv_file(
    cv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Serve CV file for preview or download."""
    cv = (
        db.query(CVVersion)
        .filter(CVVersion.id == cv_id, CVVersion.user_id == current_user.id)
        .first()
    )
    if not cv:
        raise HTTPException(status_code=404, detail="CV not found")

    full_path = storage.get_full_path(cv.file_path)
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    media_type = (
        "application/pdf"
        if cv.file_type == "pdf"
        else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    return FileResponse(
        full_path,
        media_type=media_type,
        filename=cv.name + ("." + cv.file_type),
        headers={"Content-Disposition": "inline"},
    )


@router.delete("/{cv_id}", status_code=204)
def delete_cv(
    cv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a CV version."""
    cv = (
        db.query(CVVersion)
        .filter(CVVersion.id == cv_id, CVVersion.user_id == current_user.id)
        .first()
    )
    if not cv:
        raise HTTPException(status_code=404, detail="CV not found")
    storage.delete_file(cv.file_path)
    db.delete(cv)
    db.commit()
    return None
