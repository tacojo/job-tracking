"""Local file storage (abstraction for future GCS)."""

import shutil
from pathlib import Path

from app.config import settings


def _base() -> Path:
    base = Path(settings.storage_path) / "uploads"
    base.mkdir(parents=True, exist_ok=True)
    return base


def save_cv(user_id: int, filename: str, content: bytes) -> str:
    """Save CV file; return relative path."""
    base = _base() / str(user_id)
    base.mkdir(parents=True, exist_ok=True)
    path = base / filename
    path.write_bytes(content)
    return str(path.relative_to(settings.storage_path))


def save_cover_letter(user_id: int, filename: str, content: bytes) -> str:
    """Save cover letter file; return relative path."""
    base = _base() / str(user_id) / "cover_letters"
    base.mkdir(parents=True, exist_ok=True)
    path = base / filename
    path.write_bytes(content)
    return str(path.relative_to(settings.storage_path))


def read_file(relative_path: str) -> bytes:
    """Read file by relative path."""
    full = Path(settings.storage_path) / relative_path
    return full.read_bytes()


def delete_file(relative_path: str) -> None:
    """Delete file by relative path."""
    full = Path(settings.storage_path) / relative_path
    if full.exists():
        full.unlink()


def get_full_path(relative_path: str) -> Path:
    """Get absolute path for a stored file."""
    return Path(settings.storage_path) / relative_path


def delete_user_uploads(user_id: int) -> None:
    """Delete all CV uploads for a user (uploads/{user_id}/)."""
    user_dir = Path(settings.storage_path) / "uploads" / str(user_id)
    if user_dir.exists():
        shutil.rmtree(user_dir)
