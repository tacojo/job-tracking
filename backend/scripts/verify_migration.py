#!/usr/bin/env python3
"""Verify SQLite vs Postgres row counts and local file paths."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
SCRIPTS = BACKEND / "scripts"
for path in (BACKEND, SCRIPTS):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from migration_utils import (  # noqa: E402
    TABLE_NAMES,
    count_table,
    default_sqlite_path,
    sqlite_engine,
)
from sqlalchemy import create_engine, text  # noqa: E402


def _file_paths_from_sqlite(engine, query: str) -> list[str]:
    with engine.connect() as conn:
        if "application_documents" not in engine.dialect.get_table_names(conn):
            return []
        return [row[0] for row in conn.execute(text(query)).fetchall()]


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify migration parity")
    parser.add_argument("--sqlite", type=Path, default=default_sqlite_path())
    parser.add_argument(
        "--postgres-url",
        default=os.environ.get("DATABASE_URL_POSTGRES", ""),
    )
    parser.add_argument(
        "--files-root",
        type=Path,
        default=None,
        help="Local FILES_ROOT for path checks (default: ../storage/files)",
    )
    args = parser.parse_args()

    pg_url = (args.postgres_url or "").strip()
    if not pg_url:
        print(
            "Error: --postgres-url or DATABASE_URL_POSTGRES required", file=sys.stderr
        )
        return 1

    src = sqlite_engine(args.sqlite)
    dst = create_engine(pg_url)
    files_root = args.files_root or (BACKEND.parent / "storage" / "files")

    failed = False
    print("Table counts:")
    for name in TABLE_NAMES:
        sc = count_table(src, name)
        pc = count_table(dst, name)
        ok = sc == pc
        mark = "OK" if ok else "MISMATCH"
        print(f"  {name}: sqlite={sc} postgres={pc} [{mark}]")
        if not ok:
            failed = True

    print("\nFile path checks (local disk):")
    missing = []
    with src.connect() as conn:
        for row in conn.execute(
            text("SELECT storage_path FROM application_documents")
        ).fetchall():
            rel = row[0]
            full = files_root / rel.replace("\\", "/")
            if not full.is_file():
                missing.append(rel)
        for row in conn.execute(
            text("SELECT file_path FROM cv_versions WHERE file_path IS NOT NULL")
        ).fetchall():
            rel = row[0]
            full = (BACKEND.parent / "storage" / rel).resolve()
            if not full.is_file():
                missing.append(rel)

    if missing:
        failed = True
        print(f"  Missing {len(missing)} file(s) on disk:")
        for p in missing[:20]:
            print(f"    - {p}")
        if len(missing) > 20:
            print(f"    ... and {len(missing) - 20} more")
    else:
        print("  All referenced files present locally")

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
