"""Cover letter versions API: upload, list, preview."""

import re
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models import CoverLetterVersion, User
from app.services import storage
from app.services.file_responses import serve_storage_path

router = APIRouter(prefix="/api/cover-letters", tags=["cover-letters"])

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
    safe = re.sub(r"[^\w\-.]", "_", path.stem)[:100] + ext
    return safe, ext[1:]


@router.get("")
def list_cover_letter_versions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List cover letter versions for the current user."""
    return (
        db.query(CoverLetterVersion)
        .filter(CoverLetterVersion.user_id == current_user.id)
        .order_by(CoverLetterVersion.created_at.desc())
        .all()
    )


@router.post("", status_code=201)
def upload_cover_letter(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a cover letter (PDF or DOCX)."""
    filename, file_type = _check_file(file)
    content = file.file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 10 MB)")

    file_path = storage.save_cover_letter(current_user.id, filename, content)
    cl = CoverLetterVersion(
        user_id=current_user.id,
        name=Path(file.filename or filename).stem,
        file_path=file_path,
        file_type=file_type,
    )
    db.add(cl)
    db.commit()
    db.refresh(cl)
    return cl


@router.get("/{cl_id}/file")
def get_cover_letter_file(
    cl_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Serve cover letter file for preview or download."""
    cl = (
        db.query(CoverLetterVersion)
        .filter(
            CoverLetterVersion.id == cl_id,
            CoverLetterVersion.user_id == current_user.id,
        )
        .first()
    )
    if not cl:
        raise HTTPException(status_code=404, detail="Cover letter not found")

    media_type = (
        "application/pdf"
        if cl.file_type == "pdf"
        else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    return serve_storage_path(
        cl.file_path,
        media_type=media_type,
        filename=cl.name + ("." + cl.file_type),
        download=False,
        app_document=False,
    )


@router.delete("/{cl_id}", status_code=204)
def delete_cover_letter(
    cl_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a cover letter version."""
    cl = (
        db.query(CoverLetterVersion)
        .filter(
            CoverLetterVersion.id == cl_id,
            CoverLetterVersion.user_id == current_user.id,
        )
        .first()
    )
    if not cl:
        raise HTTPException(status_code=404, detail="Cover letter not found")
    storage.delete_file(cl.file_path)
    db.delete(cl)
    db.commit()
    return None
