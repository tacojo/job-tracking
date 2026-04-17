"""Application documents API - upload, list, download, replace."""

from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models import Application, ApplicationDocument, User
from app.schemas import ApplicationDocumentRead
from app.services import app_document_storage

router = APIRouter(prefix="/api/applications", tags=["application-documents"])

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt", ".zip"}
MAX_SIZE = 15 * 1024 * 1024  # 15 MB

EXT_TO_FORMAT = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".doc": "doc",
    ".txt": "txt",
    ".zip": "zip",
}

MIME_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "doc": "application/msword",
    "txt": "text/plain",
    "zip": "application/zip",
}


def _check_file(file: UploadFile) -> tuple[str, str, str]:
    """Return (filename, ext, format) or raise."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename")
    path = Path(file.filename)
    ext = path.suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Allowed: PDF, DOCX, DOC, TXT, ZIP. Got: {ext}",
        )
    fmt = EXT_TO_FORMAT.get(ext, "")
    return file.filename, ext, fmt


def _resolve_app(db: Session, app_id: str, user_id: int) -> Application:
    """Get application by uuid or id, ensure user owns it."""
    q = db.query(Application).filter(Application.user_id == user_id)
    if app_id.isdigit():
        app = q.filter(Application.id == int(app_id)).first()
    else:
        app = q.filter(Application.uuid == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return app


@router.get("/{app_id}/documents", response_model=list[ApplicationDocumentRead])
def list_documents(
    app_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List documents for an application."""
    app = _resolve_app(db, app_id, current_user.id)
    docs = (
        db.query(ApplicationDocument)
        .filter(ApplicationDocument.application_id == app.id)
        .order_by(
            ApplicationDocument.doc_type,
            ApplicationDocument.version,
            ApplicationDocument.format,
        )
        .all()
    )
    return [ApplicationDocumentRead.model_validate(d) for d in docs]


@router.post(
    "/{app_id}/documents", response_model=ApplicationDocumentRead, status_code=201
)
def upload_document(
    app_id: str,
    doc_type: str = Query(..., description="cv, cover_letter, jd, test, other"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a document (CV, cover letter, JD, test)."""
    if doc_type not in ("cv", "cover_letter", "jd", "test", "other"):
        raise HTTPException(
            status_code=400,
            detail="doc_type must be: cv, cover_letter, jd, test, other",
        )

    app = _resolve_app(db, app_id, current_user.id)
    filename, ext, fmt = _check_file(file)
    content = file.file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 15 MB)")

    # Next version for this doc_type
    max_ver = (
        db.query(ApplicationDocument.version)
        .filter(
            ApplicationDocument.application_id == app.id,
            ApplicationDocument.doc_type == doc_type,
        )
        .order_by(ApplicationDocument.version.desc())
        .first()
    )
    version = (max_ver[0] + 1) if max_ver else 1

    storage_path = app_document_storage.save_document(
        user_id=current_user.id,
        app_uuid=app.uuid,
        doc_type=doc_type,
        filename=filename,
        content=content,
    )

    mime = MIME_TYPES.get(fmt, file.content_type or "application/octet-stream")

    doc = ApplicationDocument(
        application_id=app.id,
        doc_type=doc_type,
        version=version,
        filename=filename,
        storage_path=storage_path,
        format=fmt or "",
        mime_type=mime,
        size_bytes=len(content),
        storage_provider="local",
        created_by=current_user.id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return ApplicationDocumentRead.model_validate(doc)


@router.get("/{app_id}/documents/{doc_uuid}/file")
def get_document_file(
    app_id: str,
    doc_uuid: str,
    download: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Serve document file for preview or download."""
    app = _resolve_app(db, app_id, current_user.id)
    doc = (
        db.query(ApplicationDocument)
        .filter(
            ApplicationDocument.application_id == app.id,
            ApplicationDocument.uuid == doc_uuid,
        )
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    full_path = app_document_storage.get_full_path(doc.storage_path)
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    disposition = "attachment" if download else "inline"
    filename = doc.filename or "document"
    if filename.isascii():
        content_disposition = f'{disposition}; filename="{filename}"'
    else:
        ascii_fallback = (
            filename.encode("ascii", "ignore").decode("ascii") or "document"
        )
        encoded = quote(filename, safe="")
        content_disposition = (
            f"{disposition}; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded}"
        )
    return FileResponse(
        full_path,
        media_type=doc.mime_type or "application/octet-stream",
        headers={"Content-Disposition": content_disposition},
    )


@router.put(
    "/{app_id}/documents/{doc_uuid}/replace", response_model=ApplicationDocumentRead
)
def replace_document(
    app_id: str,
    doc_uuid: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Replace document content (keep same version, new file)."""
    app = _resolve_app(db, app_id, current_user.id)
    doc = (
        db.query(ApplicationDocument)
        .filter(
            ApplicationDocument.application_id == app.id,
            ApplicationDocument.uuid == doc_uuid,
        )
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    filename, ext, fmt = _check_file(file)
    content = file.file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 15 MB)")

    # Delete old file
    app_document_storage.delete_document(doc.storage_path)

    # Save new file
    storage_path = app_document_storage.save_document(
        user_id=current_user.id,
        app_uuid=app.uuid,
        doc_type=doc.doc_type,
        filename=filename,
        content=content,
    )

    doc.filename = filename
    doc.storage_path = storage_path
    doc.format = fmt or ""
    doc.mime_type = MIME_TYPES.get(fmt, file.content_type or "application/octet-stream")
    doc.size_bytes = len(content)
    db.commit()
    db.refresh(doc)
    return ApplicationDocumentRead.model_validate(doc)


@router.delete("/{app_id}/documents/{doc_uuid}", status_code=204)
def delete_document(
    app_id: str,
    doc_uuid: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a document."""
    app = _resolve_app(db, app_id, current_user.id)
    doc = (
        db.query(ApplicationDocument)
        .filter(
            ApplicationDocument.application_id == app.id,
            ApplicationDocument.uuid == doc_uuid,
        )
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    app_document_storage.delete_document(doc.storage_path)
    db.delete(doc)
    db.commit()
    return None
