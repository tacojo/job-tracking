#!/usr/bin/env python3
"""Reset database: drop all tables and recreate from current models.
Run from project root:
    docker compose run --rm backend python -m app.reset_db
"""

from sqlalchemy import text

from app.db import engine, init_db


def main():
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
    print("Dropped all tables.")
    init_db()
    print("Database recreated from current schema.")


if __name__ == "__main__":
    main()
