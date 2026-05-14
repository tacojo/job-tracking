"""SQLite database backup before destructive operations."""

import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional

from sqlalchemy.engine.url import make_url

from app.config import settings


def create_sqlite_backup() -> Optional[dict]:
    """
    If database_url points to a file-based SQLite DB, copy it to storage/backups/.
    Returns dict with filename, path, and absolute_path, or None if skipped.
    """
    try:
        u = make_url(settings.database_url)
    except Exception:
        return None

    if u.drivername != "sqlite":
        return None

    db = u.database
    if not db or db == ":memory:":
        return None

    db_path = Path(db)
    if not db_path.is_absolute():
        db_path = Path.cwd() / db_path
    db_path = db_path.resolve()

    if not db_path.is_file():
        return None

    backup_dir = Path(settings.storage_path).resolve() / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    dest = backup_dir / f"job_tracking_backup_{stamp}.db"
    shutil.copy2(db_path, dest)
    dest_resolved = dest.resolve()
    try:
        path_for_display = str(dest_resolved.relative_to(Path.cwd()))
    except ValueError:
        path_for_display = str(dest_resolved)
    return {
        "filename": dest.name,
        "path": path_for_display,
        "absolute_path": str(dest_resolved),
    }
