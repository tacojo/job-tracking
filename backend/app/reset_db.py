#!/usr/bin/env python3
"""Reset database: drop all tables and recreate from current models.

SQLite: drop via sqlite_master.
Postgres: Alembic downgrade base + upgrade head.

Run from project root:
    docker compose run --rm backend python -m app.reset_db
"""

from __future__ import annotations

from sqlalchemy import inspect, text

from app.config import settings
from app.db import engine, init_db, run_alembic_upgrade


def _reset_postgres() -> None:
    from pathlib import Path

    from alembic import command
    from alembic.config import Config

    cfg = Config(Path(__file__).resolve().parent.parent / "alembic.ini")
    cfg.set_main_option("sqlalchemy.url", settings.database_url)
    try:
        command.downgrade(cfg, "base")
    except Exception:
        with engine.begin() as conn:
            for name in inspect(engine).get_table_names():
                conn.execute(text(f'DROP TABLE IF EXISTS "{name}" CASCADE'))
    run_alembic_upgrade()


def _reset_sqlite() -> None:
    with engine.connect() as conn:
        conn.execute(text("PRAGMA foreign_keys=OFF"))
        conn.commit()
        tables = conn.execute(
            text(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            )
        ).fetchall()
        for (name,) in tables:
            conn.execute(text(f"DROP TABLE IF EXISTS {name}"))
            conn.commit()
        conn.execute(text("PRAGMA foreign_keys=ON"))
        conn.commit()


def main():
    if settings.is_postgres:
        _reset_postgres()
    else:
        _reset_sqlite()
    print("Dropped all tables.")
    init_db()
    print("Database recreated from current schema.")


if __name__ == "__main__":
    main()
