"""Application document storage - relative paths, Supabase Storage or local files."""

from datetime import datetime
from pathlib import Path

from app.config import settings
from app.services import blob_storage

FILES_ROOT = Path(settings.files_root)
FILES_ROOT.mkdir(parents=True, exist_ok=True)

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
    folder = DOC_TYPE_FOLDERS.get(doc_type, "documents/other")
    now = datetime.utcnow().strftime("%Y-%m-%dT%H%M%SZ")
    safe_name = _sanitize_filename(filename)
    rel = f"users/{user_id}/applications/{app_uuid}/{folder}/{now}_{safe_name}"
    return rel.replace("\\", "/")


def _sanitize_filename(name: str) -> str:
    if not name or not name.strip():
        return "unnamed"
    base = Path(name).name
    safe = "".join(c if c.isalnum() or c in "._-" else "_" for c in base)
    return safe[:200] or "unnamed"


def save_document(
    user_id: int,
    app_uuid: str,
    doc_type: str,
    filename: str,
    content: bytes,
) -> str:
    """Save document; return relative storage_path (under files root)."""
    rel = _rel_path(user_id, app_uuid, doc_type, filename)
    key = blob_storage.key_for_app_document(rel)
    blob_storage.write_bytes(key, content)
    return rel


def get_full_path(storage_path: str) -> Path:
    """Resolve relative storage_path to absolute local path (local backend only)."""
    local = blob_storage.open_local_path(
        blob_storage.key_for_app_document(storage_path)
    )
    if local is not None:
        return local
    return FILES_ROOT / storage_path.replace("\\", "/")


def delete_document(storage_path: str) -> None:
    blob_storage.delete_key(blob_storage.key_for_app_document(storage_path))


def read_document(storage_path: str) -> bytes:
    return blob_storage.read_bytes(blob_storage.key_for_app_document(storage_path))


def document_exists(storage_path: str) -> bool:
    return blob_storage.exists(blob_storage.key_for_app_document(storage_path))


def delete_user_application_files(user_id: int) -> None:
    blob_storage.delete_prefix(f"files/users/{user_id}/")


def delete_application_folder(user_id: int, app_uuid: str) -> None:
    blob_storage.delete_prefix(f"files/users/{user_id}/applications/{app_uuid}")


def local_files_root() -> Path:
    return FILES_ROOT


def iter_local_files_root() -> Path:
    """Walk local files directory (for migration upload script)."""
    return FILES_ROOT
