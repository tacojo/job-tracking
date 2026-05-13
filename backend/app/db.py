"""Database engine and session management."""

from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    """SQLAlchemy declarative base for ORM models."""

    pass


# Ensure DB directory exists for SQLite (when using file-based DB)
_db_path = settings.database_url.replace("sqlite:///", "").strip()
if _db_path and _db_path != ":memory:":
    Path(_db_path).parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    settings.database_url,
    connect_args=(
        {"check_same_thread": False} if "sqlite" in settings.database_url else {}
    ),
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Dependency for FastAPI to get DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


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


def init_db():
    """Create all tables from current models."""
    from app.models import (  # noqa: F401
        ai_prompt,
        application,
        application_document,
        application_note,
        application_prospect_answer,
        company,
        company_note,
        cover_letter_version,
        cv_experience,
        cv_profile,
        cv_version,
        job_description,
        prospect_question,
        recruiter,
        recruiter_note,
        role,
        stage,
        user,
    )

    _migrate_stages_to_application_events()
    Base.metadata.create_all(bind=engine)
    _migrate_stage_occurred_to_scheduled()
    _migrate_add_feedback_column()
    _migrate_application_documents()
    _seed_prospect_questions()
    _seed_ai_prompts()


def _seed_prospect_questions():
    """Insert default prospect questions if the table is empty (editable later in DB)."""
    from app.models.prospect_question import ProspectQuestion

    with SessionLocal() as db:
        if db.query(ProspectQuestion).first() is not None:
            return
        defaults = [
            (0, "Brief introduction of yourself"),
            (1, "Brief introduction of the current role"),
            (2, "Summary of relevant experience aligned to the role requirements"),
            (3, "Relevant industry or domain experience"),
            (4, "Motivation for the move / why interested in this role"),
        ]
        for sort_order, question_text in defaults:
            db.add(ProspectQuestion(question_text=question_text, sort_order=sort_order))
        db.commit()


def _seed_ai_prompts():
    """Insert default AI prompts if not present (editable on Settings page)."""
    from app.models.ai_prompt import AiPrompt

    defaults = {
        "tailor_cv": (
            "You are a professional career advisor. "
            "You are requested to tailor the candidate's CV to the job and company. "
            "Keep the same facts and experience; rephrase and reorder for relevance. "
            "Do not exaggerate, do not add skills they do not have, or change dates or job titles."
            "Output only the tailored CV text (no preamble)."
        ),
        "tailor_cover_letter": (
            "You are a professional career advisor. Tailor the candidate's cover letter to the job and company. "
            "Keep the same experience and tone; adjust wording and emphasis for relevance. Do not exaggerate. "
            "Output only the tailored cover letter text (no preamble)."
        ),
        "prospect_answer": (
            "You are helping a job candidate prepare answers for applications and interviews. "
            "Write in British English. Use a simple, natural tone — conversational and genuine, not formal or stiff. "
            "Base your answer on the context provided (CV, cover letter, company, job spec). "
            "Do not exaggerate. Output only the answer text, no preamble or labels."
        ),
    }
    with SessionLocal() as db:
        for key, value in defaults.items():
            if db.query(AiPrompt).filter(AiPrompt.key == key).first() is None:
                db.add(AiPrompt(key=key, value=value))
        db.commit()
