"""Notes API - company_notes, recruiter_notes, application_notes."""

from sqlalchemy.orm import Session

from app.models import ApplicationNote, CompanyNote, RecruiterNote


def _notes_to_log(rows, text_attr="text", created_attr="created_at") -> list[dict]:
    """Convert note rows to notes_log format [{timestamp, text}, ...], newest first."""
    return [
        {
            "timestamp": (
                getattr(n, created_attr).isoformat()
                if getattr(n, created_attr)
                else None
            ),
            "text": getattr(n, text_attr),
        }
        for n in rows
    ]


def get_notes_for_source(
    db: Session,
    user_id: int,
    source: str,
    source_id: int,
) -> list[dict]:
    """Fetch notes for a source and return as notes_log format."""
    if source == "company":
        notes = (
            db.query(CompanyNote)
            .filter(CompanyNote.company_id == source_id, CompanyNote.user_id == user_id)
            .order_by(CompanyNote.created_at.desc())
            .all()
        )
        return _notes_to_log(notes, text_attr="note")
    if source == "recruiter":
        notes = (
            db.query(RecruiterNote)
            .filter(
                RecruiterNote.recruiter_id == source_id,
                RecruiterNote.user_id == user_id,
            )
            .order_by(RecruiterNote.created_at.desc())
            .all()
        )
        return _notes_to_log(notes, text_attr="note")
    if source == "application":
        notes = (
            db.query(ApplicationNote)
            .filter(
                ApplicationNote.application_id == source_id,
                ApplicationNote.user_id == user_id,
            )
            .order_by(ApplicationNote.created_at.desc())
            .all()
        )
        return _notes_to_log(notes, text_attr="note")
    return []


def add_note(
    db: Session,
    user_id: int,
    source: str,
    source_id: int,
    text: str,
):
    """Create a new note in company_notes, recruiter_notes, or legacy notes."""
    text = text.strip()
    if source == "company":
        note = CompanyNote(company_id=source_id, user_id=user_id, note=text)
        db.add(note)
        db.commit()
        db.refresh(note)
        return note
    if source == "recruiter":
        note = RecruiterNote(recruiter_id=source_id, user_id=user_id, note=text)
        db.add(note)
        db.commit()
        db.refresh(note)
        return note
    if source == "application":
        note = ApplicationNote(application_id=source_id, user_id=user_id, note=text)
        db.add(note)
        db.commit()
        db.refresh(note)
        return note
    raise ValueError(f"Unknown note source: {source}")
