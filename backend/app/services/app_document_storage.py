"""Application document storage - relative paths, GCS-ready."""

import shutil
from datetime import datetime
from pathlib import Path

from app.config import settings

# Final root for app documents; defaults to STORAGE_PATH/files (see Settings.derive_files_root).
FILES_ROOT = Path(settings.files_root)
FILES_ROOT.mkdir(parents=True, exist_ok=True)

# Doc type -> subfolder
DOC_TYPE_FOLDERS = {
    "cv": "documents/cv",
    "cover_letter": "documents/cover_letter",
    "jd": "originals/jd",
    "test": "documents/tests",
    "other": "documents/other",
    "tailored_cv": "documents/tailored_cv",
    "tailored_cover_letter": "documents/tailored_cover_letter",
}


def _rel_path(user_id: int, app_uuid: str, doc_type: str, filename: str) -> str:
    """Build relative storage path. Uses forward slashes for portability."""
    folder = DOC_TYPE_FOLDERS.get(doc_type, "documents/other")
    # Timestamp prefix to avoid clashes: 2026-03-01T103000Z_filename.pdf
    now = datetime.utcnow().strftime("%Y-%m-%dT%H%M%SZ")
    safe_name = _sanitize_filename(filename)
    rel = f"users/{user_id}/applications/{app_uuid}/{folder}/{now}_{safe_name}"
    return rel.replace("\\", "/")


def _sanitize_filename(name: str) -> str:
    """Keep filename safe for filesystem."""
    if not name or not name.strip():
        return "unnamed"
    # Remove path components
    base = Path(name).name
    # Replace unsafe chars
    safe = "".join(c if c.isalnum() or c in "._-" else "_" for c in base)
    return safe[:200] or "unnamed"


def save_document(
    user_id: int,
    app_uuid: str,
    doc_type: str,
    filename: str,
    content: bytes,
) -> str:
    """Save document; return relative storage_path."""
    rel = _rel_path(user_id, app_uuid, doc_type, filename)
    full = FILES_ROOT / rel
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_bytes(content)
    return rel


def get_full_path(storage_path: str) -> Path:
    """Resolve relative storage_path to absolute path."""
    return FILES_ROOT / storage_path.replace("\\", "/")


def delete_document(storage_path: str) -> None:
    """Delete file by relative path."""
    full = get_full_path(storage_path)
    if full.exists():
        full.unlink()


def read_document(storage_path: str) -> bytes:
    """Read file by relative path."""
    return get_full_path(storage_path).read_bytes()


def delete_user_application_files(user_id: int) -> None:
    """Delete all application document files for a user (users/{user_id}/)."""
    user_dir = FILES_ROOT / "users" / str(user_id)
    if user_dir.exists():
        shutil.rmtree(user_dir)
