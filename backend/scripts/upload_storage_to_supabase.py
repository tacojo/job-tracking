#!/usr/bin/env python3
"""Upload local storage/files and storage/uploads to Supabase Storage.

Object keys match blob_storage layout:
  files/{application document path}
  uploads/{cv/cover letter path}

Requires STORAGE_BACKEND=supabase env vars (or pass flags).
"""

from __future__ import annotations

import argparse
import mimetypes
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
SCRIPTS = BACKEND / "scripts"
for path in (BACKEND, SCRIPTS):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from migration_utils import project_root  # noqa: E402

from app.config import settings  # noqa: E402
from app.services import blob_storage  # noqa: E402


def _guess_type(path: Path) -> str:
    mt, _ = mimetypes.guess_type(path.name)
    return mt or "application/octet-stream"


def _upload_tree(local_dir: Path, key_prefix: str, *, dry_run: bool) -> int:
    if not local_dir.is_dir():
        print(f"Skip missing directory: {local_dir}")
        return 0
    count = 0
    for path in local_dir.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(local_dir).as_posix()
        key = f"{key_prefix}/{rel}" if key_prefix else rel
        if dry_run:
            print(f"  would upload: {key}")
        else:
            blob_storage.write_bytes(key, path.read_bytes(), _guess_type(path))
        count += 1
    return count


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Upload local files to Supabase Storage"
    )
    parser.add_argument(
        "--storage-path",
        type=Path,
        default=project_root() / "storage",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    os.environ.setdefault("STORAGE_BACKEND", "supabase")
    if not settings.supabase_url or not settings.supabase_service_role_key:
        print(
            "Error: set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, "
            "SUPABASE_STORAGE_BUCKET",
            file=sys.stderr,
        )
        return 1

    files_dir = args.storage_path / "files"
    uploads_dir = args.storage_path / "uploads"

    print(f"Bucket: {settings.supabase_storage_bucket}")
    print(f"Files root: {files_dir}")
    print(f"Uploads root: {uploads_dir}")

    n1 = _upload_tree(files_dir, "files", dry_run=args.dry_run)
    n2 = _upload_tree(uploads_dir, "uploads", dry_run=args.dry_run)
    print(f"Uploaded {n1 + n2} object(s)" + (" (dry run)" if args.dry_run else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
