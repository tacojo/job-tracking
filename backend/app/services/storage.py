"""Local file storage for CV/cover letter uploads (Supabase Storage or disk)."""

from pathlib import Path

from app.config import settings
from app.services import blob_storage


def _base() -> Path:
    base = Path(settings.storage_path) / "uploads"
    base.mkdir(parents=True, exist_ok=True)
    return base


def save_cv(user_id: int, filename: str, content: bytes) -> str:
    """Save CV file; return relative path under storage_path."""
    rel = f"uploads/{user_id}/{filename}".replace("\\", "/")
    blob_storage.write_bytes(blob_storage.key_for_upload(rel), content)
    return rel


def save_cover_letter(user_id: int, filename: str, content: bytes) -> str:
    rel = f"uploads/{user_id}/cover_letters/{filename}".replace("\\", "/")
    blob_storage.write_bytes(blob_storage.key_for_upload(rel), content)
    return rel


def read_file(relative_path: str) -> bytes:
    return blob_storage.read_bytes(blob_storage.key_for_upload(relative_path))


def delete_file(relative_path: str) -> None:
    blob_storage.delete_key(blob_storage.key_for_upload(relative_path))


def get_full_path(relative_path: str) -> Path:
    local = blob_storage.open_local_path(blob_storage.key_for_upload(relative_path))
    if local is not None:
        return local
    return Path(settings.storage_path) / relative_path


def file_exists(relative_path: str) -> bool:
    return blob_storage.exists(blob_storage.key_for_upload(relative_path))


def delete_user_uploads(user_id: int) -> None:
    blob_storage.delete_prefix(f"uploads/{user_id}")


def local_uploads_root() -> Path:
    return Path(settings.storage_path) / "uploads"
