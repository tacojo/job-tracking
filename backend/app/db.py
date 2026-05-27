"""Database engine and session management."""

from pathlib import Path

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    """SQLAlchemy declarative base for ORM models."""

    pass


def _engine_connect_args() -> dict:
    if settings.is_sqlite:
        return {"check_same_thread": False}
    return {}


# Ensure DB directory exists for SQLite (when using file-based DB)
if settings.is_sqlite:
    _db_path = settings.database_url.replace("sqlite:///", "").strip()
    if _db_path and _db_path != ":memory:":
        Path(_db_path).parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    settings.database_url,
    connect_args=_engine_connect_args(),
)

if settings.is_sqlite:

    @event.listens_for(engine, "connect")
    def _sqlite_enable_foreign_keys(dbapi_conn, _connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Dependency for FastAPI to get DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def run_alembic_upgrade() -> None:
    """Apply Alembic migrations (Postgres / production)."""
    from alembic import command
    from alembic.config import Config

    alembic_cfg = Config(Path(__file__).resolve().parent.parent / "alembic.ini")
    command.upgrade(alembic_cfg, "head")


def _sqlite_only_migrations() -> None:
    """Legacy incremental migrations for existing SQLite databases."""
    if not settings.is_sqlite:
        return
    _migrate_stages_to_application_events()
    _migrate_learning_table_names()
    _migrate_learning_v2_concept_graph_sqlite()
    Base.metadata.create_all(bind=engine)
    _migrate_stage_occurred_to_scheduled()
    _migrate_add_feedback_column()
    _migrate_application_documents()
    _migrate_learning_items_notion_level()


def init_db():
    """Create or upgrade schema; seed defaults when empty."""
    from app.models import (  # noqa: F401
        ai_prompt,
        application,
        application_document,
        application_note,
        application_prospect_answer,
        application_swot_analysis,
        company,
        company_note,
        cover_letter_version,
        cv_experience,
        cv_profile,
        cv_version,
        job_description,
        learning_concept,
        learning_item,
        project,
        prospect_question,
        recruiter,
        recruiter_note,
        role,
        stage,
        tag,
        user,
    )

    if settings.is_postgres:
        run_alembic_upgrade()
    else:
        _sqlite_only_migrations()
        _migrate_ai_prospect_user_id()
        _migrate_application_child_user_id()


def _migrate_application_child_user_id() -> None:
    """Add user_id to application child tables (legacy SQLite databases)."""
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    if "application_documents" not in tables:
        return
    cols = {c["name"] for c in inspector.get_columns("application_documents")}
    if "user_id" in cols:
        return

    child_tables = (
        "application_documents",
        "application_events",
        "application_job_descriptions",
        "application_prospect_answers",
        "application_swot_analyses",
    )
    with engine.connect() as conn:
        for table in child_tables:
            if table not in tables:
                continue
            conn.execute(
                text(
                    f"ALTER TABLE {table} ADD COLUMN user_id INTEGER "
                    "REFERENCES users(id) ON DELETE CASCADE"
                )
            )
            conn.execute(
                text(
                    f"""
                    UPDATE {table}
                    SET user_id = (
                        SELECT applications.user_id
                        FROM applications
                        WHERE applications.id = {table}.application_id
                    )
                    """
                )
            )
            conn.execute(text(f"DELETE FROM {table} WHERE user_id IS NULL"))
            conn.execute(text(f"CREATE INDEX ix_{table}_user_id ON {table} (user_id)"))
        conn.commit()


def _migrate_ai_prospect_user_id() -> None:
    """Scope ai_prompts and prospect_questions to users (legacy SQLite databases)."""
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    if "ai_prompts" not in tables or "prospect_questions" not in tables:
        return
    ai_cols = {c["name"] for c in inspector.get_columns("ai_prompts")}
    if "user_id" in ai_cols:
        return

    with engine.connect() as conn:
        conn.execute(
            text(
                "ALTER TABLE ai_prompts ADD COLUMN user_id INTEGER "
                "REFERENCES users(id) ON DELETE CASCADE"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE prospect_questions ADD COLUMN user_id INTEGER "
                "REFERENCES users(id) ON DELETE CASCADE"
            )
        )
        user_ids = [
            row[0] for row in conn.execute(text("SELECT id FROM users")).fetchall()
        ]
        legacy_prompts = [
            (row[0], row[1])
            for row in conn.execute(
                text("SELECT key, value FROM ai_prompts")
            ).fetchall()
        ]
        legacy_questions = [
            (row[0], row[1])
            for row in conn.execute(
                text("SELECT question_text, sort_order FROM prospect_questions")
            ).fetchall()
        ]
        conn.execute(text("DELETE FROM ai_prompts"))
        conn.execute(text("DELETE FROM prospect_questions"))
        for user_id in user_ids:
            for key, value in legacy_prompts:
                conn.execute(
                    text(
                        "INSERT INTO ai_prompts (key, value, user_id) "
                        "VALUES (:key, :value, :user_id)"
                    ),
                    {"key": key, "value": value, "user_id": user_id},
                )
            for question_text, sort_order in legacy_questions:
                conn.execute(
                    text(
                        "INSERT INTO prospect_questions "
                        "(question_text, sort_order, user_id) "
                        "VALUES (:question_text, :sort_order, :user_id)"
                    ),
                    {
                        "question_text": question_text,
                        "sort_order": sort_order,
                        "user_id": user_id,
                    },
                )
        conn.execute(text("DROP INDEX IF EXISTS ix_ai_prompts_key"))
        conn.execute(text("CREATE INDEX ix_ai_prompts_key ON ai_prompts (key)"))
        conn.execute(
            text(
                "CREATE UNIQUE INDEX uq_ai_prompts_user_key "
                "ON ai_prompts (user_id, key)"
            )
        )
        conn.execute(text("CREATE INDEX ix_ai_prompts_user_id ON ai_prompts (user_id)"))
        conn.execute(
            text(
                "CREATE INDEX ix_prospect_questions_user_id "
                "ON prospect_questions (user_id)"
            )
        )
        conn.commit()


def _migrate_stages_to_application_events():
    """Rename table stages -> application_events. Drop old application_events if it has the legacy schema."""
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    # If application_events exists with old schema (event_type from removed ApplicationEvent model), drop it
    if "application_events" in tables:
        cols = [c["name"] for c in inspector.get_columns("application_events")]
        if "stage_type" not in cols and "event_type" in cols:
            with engine.connect() as conn:
                conn.execute(text("DROP TABLE application_events"))
                conn.commit()
            tables = inspector.get_table_names()
    # Rename stages -> application_events when we have stages and no (valid) application_events
    if "stages" not in tables:
        return
    if "application_events" in tables:
        return
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE stages RENAME TO application_events"))
        conn.commit()


def _migrate_application_documents():
    """Recreate application_documents if it has old schema (missing uuid column)."""
    from app.models.application_document import ApplicationDocument

    inspector = inspect(engine)
    if "application_documents" not in inspector.get_table_names():
        return
    cols = [c["name"] for c in inspector.get_columns("application_documents")]
    if "uuid" in cols:
        return
    # Old schema: drop and recreate
    ApplicationDocument.__table__.drop(engine, checkfirst=True)
    ApplicationDocument.__table__.create(engine)


def _migrate_stage_occurred_to_scheduled():
    """
    Ensure application_events uses scheduled_at instead of occurred_at.

    Steps:
    - If table missing, do nothing.
    - If scheduled_at column missing, add it.
    - If occurred_at exists, copy values into scheduled_at where scheduled_at is NULL.
    - Attempt to drop occurred_at (best-effort; on older SQLite this may be unsupported).
    """
    inspector = inspect(engine)
    if "application_events" not in inspector.get_table_names():
        return

    cols = [c["name"] for c in inspector.get_columns("application_events")]
    has_scheduled = "scheduled_at" in cols
    has_occurred = "occurred_at" in cols

    # Fresh schema already using scheduled_at only
    if has_scheduled and not has_occurred:
        return

    with engine.connect() as conn:
        if not has_scheduled:
            conn.execute(
                text("ALTER TABLE application_events ADD COLUMN scheduled_at DATETIME")
            )
            conn.commit()

        if has_occurred:
            # Backfill scheduled_at from occurred_at where needed
            conn.execute(
                text(
                    "UPDATE application_events "
                    "SET scheduled_at = occurred_at "
                    "WHERE scheduled_at IS NULL"
                )
            )
            conn.commit()

            # Best-effort drop of legacy column (may fail on some SQLite versions)
            try:
                conn.execute(
                    text("ALTER TABLE application_events DROP COLUMN occurred_at")
                )
                conn.commit()
            except Exception:
                conn.rollback()


def _migrate_add_feedback_column():
    """
    Add feedback column to application_events if missing.
    """
    inspector = inspect(engine)
    if "application_events" not in inspector.get_table_names():
        return

    cols = [c["name"] for c in inspector.get_columns("application_events")]
    if "feedback" in cols:
        return

    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE application_events ADD COLUMN feedback TEXT"))
        conn.commit()


def _migrate_learning_table_names():
    """Rename legacy learning-related tables so every table name starts with learning_."""
    inspector = inspect(engine)
    names = set(inspector.get_table_names())
    with engine.connect() as conn:
        if "tags" in names and "learning_tags" not in names:
            conn.execute(text("ALTER TABLE tags RENAME TO learning_tags"))
            conn.commit()
            names = set(inspect(engine).get_table_names())
        if "item_reviews" in names and "learning_item_reviews" not in names:
            conn.execute(
                text("ALTER TABLE item_reviews RENAME TO learning_item_reviews")
            )
            conn.commit()


def _migrate_learning_v2_concept_graph_sqlite():
    """Drop legacy learning_* layout and recreate schema (SQLite only). Wipes learning data."""
    if not settings.is_sqlite:
        return
    inspector = inspect(engine)
    names = inspector.get_table_names()
    if "learning_items" not in names:
        return
    cols = []
    try:
        cols = [c["name"] for c in inspector.get_columns("learning_items")]
    except Exception:
        cols = []
    need_drop = False
    if "learning_concepts" not in names:
        need_drop = True
    if "learning_item_links" in names:
        need_drop = True
    if cols and "concepts_json" in cols:
        need_drop = True
    if not need_drop:
        return
    with engine.connect() as conn:
        conn.execute(text("PRAGMA foreign_keys=OFF"))
        for stmt in (
            "DROP TABLE IF EXISTS learning_item_reviews",
            "DROP TABLE IF EXISTS learning_item_links",
            "DROP TABLE IF EXISTS learning_item_concepts",
            "DROP TABLE IF EXISTS concept_relationships",
            "DROP TABLE IF EXISTS learning_item_tags",
            "DROP TABLE IF EXISTS learning_items",
            "DROP TABLE IF EXISTS learning_concepts",
            "DROP TABLE IF EXISTS learning_tags",
        ):
            conn.execute(text(stmt))
        conn.commit()


def _migrate_learning_items_notion_level() -> None:
    """SQLite / generic: ADD COLUMN notion_level when missing."""
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    if "learning_items" not in tables:
        return
    cols = [c["name"] for c in inspector.get_columns("learning_items")]
    if "notion_level" in cols:
        return
    with engine.connect() as conn:
        conn.execute(
            text(
                "ALTER TABLE learning_items ADD COLUMN notion_level VARCHAR(32) NOT NULL DEFAULT 'intermediate'"
            )
        )
        conn.commit()
