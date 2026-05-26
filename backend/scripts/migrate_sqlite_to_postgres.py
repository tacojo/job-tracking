#!/usr/bin/env python3
"""Copy all rows from SQLite to Postgres preserving IDs."""

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
    copy_table,
    default_sqlite_path,
    migrate_all,
    postgres_engine,
    sqlite_engine,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate SQLite data to Postgres")
    parser.add_argument("--sqlite", type=Path, default=default_sqlite_path())
    parser.add_argument(
        "--postgres-url",
        default=os.environ.get("DATABASE_URL_POSTGRES", ""),
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    pg_url = (args.postgres_url or "").strip()
    if not pg_url:
        print(
            "Error: --postgres-url or DATABASE_URL_POSTGRES required", file=sys.stderr
        )
        return 1
    if not args.sqlite.is_file():
        print(f"Error: SQLite file not found: {args.sqlite}", file=sys.stderr)
        return 1

    src = sqlite_engine(args.sqlite)
    dst = postgres_engine(pg_url)

    print(f"Source: {args.sqlite}")
    if args.dry_run:
        print("DRY RUN")
        total = 0
        for name in TABLE_NAMES:
            n = copy_table(src, dst, name, dry_run=True)
            if n:
                print(f"  {name}: {n} rows")
                total += n
        print(f"Would copy {total} rows")
        return 0

    try:
        total = migrate_all(src, dst)
        for name in TABLE_NAMES:
            n = copy_table(src, dst, name, dry_run=True)
            if n:
                print(f"  {name}: {n} rows")
        print(f"Done — {total} rows copied")
    except Exception as exc:
        print(f"Migration failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
