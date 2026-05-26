"""Shared helpers for SQLite → Postgres migration scripts."""

from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import MetaData, Table, create_engine, inspect, text
from sqlalchemy.engine import Engine

# Insert order respecting foreign keys; preserve integer PKs.
TABLE_NAMES: list[str] = [
    "users",
    "ai_prompts",
    "prospect_questions",
    "companies",
    "roles",
    "recruiters",
    "cv_profiles",
    "cv_experiences",
    "cv_versions",
    "cover_letter_versions",
    "projects",
    "learning_tags",
    "learning_concepts",
    "learning_items",
    "applications",
    "application_events",
    "application_notes",
    "application_documents",
    "application_prospect_answers",
    "application_swot_analyses",
    "application_job_descriptions",
    "company_notes",
    "recruiter_notes",
    "learning_item_tags",
    "learning_item_reviews",
    "learning_item_concepts",
    "concept_relationships",
]

NO_SERIAL_ID = {"learning_item_tags", "learning_item_concepts"}
SERIAL_TABLES = [name for name in TABLE_NAMES if name not in NO_SERIAL_ID]


def project_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent


def default_sqlite_path() -> Path:
    env = os.environ.get("SQLITE_PATH", "").strip()
    if env:
        return Path(env).resolve()
    return (project_root() / "storage" / "db" / "job_tracking.db").resolve()


def sqlite_engine(path: Path) -> Engine:
    return create_engine(f"sqlite:///{path.as_posix()}")


def postgres_engine(url: str) -> Engine:
    return create_engine(url)


def reflect_tables(engine: Engine, names: list[str]) -> dict[str, Table]:
    meta = MetaData()
    return {
        n: Table(n, meta, autoload_with=engine)
        for n in names
        if n in inspect(engine).get_table_names()
    }


def copy_table(
    src: Engine,
    dst: Engine,
    table_name: str,
    *,
    dry_run: bool = False,
) -> int:
    if table_name not in inspect(src).get_table_names():
        return 0
    src_meta = reflect_tables(src, [table_name])
    dst_meta = reflect_tables(dst, [table_name])
    table = src_meta[table_name]
    dst_table = dst_meta[table_name]
    rows = src.connect().execute(table.select()).mappings().all()
    if not rows:
        return 0
    if dry_run:
        return len(rows)
    with dst.begin() as conn:
        conn.execute(dst_table.insert(), [dict(r) for r in rows])
    return len(rows)


def migrate_all(
    src: Engine,
    dst: Engine,
    *,
    dry_run: bool = False,
    truncate: bool = True,
) -> int:
    if truncate and not dry_run and dst.dialect.name == "postgresql":
        existing = [n for n in TABLE_NAMES if n in inspect(dst).get_table_names()]
        if existing:
            quoted = ", ".join(f'"{n}"' for n in existing)
            with dst.begin() as conn:
                conn.execute(text(f"TRUNCATE {quoted} RESTART IDENTITY CASCADE"))

    total = 0
    for name in TABLE_NAMES:
        n = copy_table(src, dst, name, dry_run=dry_run)
        if n:
            total += n
    if not dry_run:
        reset_postgres_sequences(dst)
    return total


def reset_postgres_sequences(engine: Engine) -> None:
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as conn:
        for name in SERIAL_TABLES:
            if name not in inspect(engine).get_table_names():
                continue
            conn.execute(
                text(
                    f"""
                    SELECT setval(
                        pg_get_serial_sequence('{name}', 'id'),
                        COALESCE((SELECT MAX(id) FROM {name}), 1),
                        (SELECT COUNT(*) > 0 FROM {name})
                    )
                    """
                )
            )


def count_table(engine: Engine, table_name: str) -> int:
    if table_name not in inspect(engine).get_table_names():
        return 0
    with engine.connect() as conn:
        return conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar_one()
