#!/usr/bin/env python3
"""Create Postgres schema on Supabase via Alembic (no data)."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Alembic upgrade on Postgres")
    parser.add_argument(
        "--database-url",
        default=os.environ.get("DATABASE_URL_POSTGRES", ""),
    )
    args = parser.parse_args()
    url = (args.database_url or "").strip()
    if not url:
        print("Error: provide --database-url or DATABASE_URL_POSTGRES", file=sys.stderr)
        return 1
    if "sqlite" in url.lower():
        print("Error: target must be Postgres", file=sys.stderr)
        return 1

    os.environ["DATABASE_URL"] = url
    os.environ["DATABASE_URL_POSTGRES"] = url

    if str(BACKEND) not in sys.path:
        sys.path.insert(0, str(BACKEND))

    from sqlalchemy import inspect

    from alembic import command
    from alembic.config import Config
    from app.db import engine

    cfg = Config(BACKEND / "alembic.ini")
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")

    tables = inspect(engine).get_table_names()
    print(f"Schema ready: {len(tables)} tables")
    for name in sorted(tables):
        print(f"  - {name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
