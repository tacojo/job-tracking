"""Recruiters CRUD API."""

import json
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.notes import add_note, get_notes_for_source
from app.db import get_db
from app.models import Application, Recruiter, User
from app.schemas import NoteAdd, RecruiterCreate, RecruiterListResponse, RecruiterRead

router = APIRouter(prefix="/api/recruiters", tags=["recruiters"])


def _recruiter_to_read(recruiter: Recruiter, notes_log: list[dict[str, Any]]) -> dict:
    """Build RecruiterRead dict with notes_log from notes table."""
    return {
        "id": recruiter.id,
        "name": recruiter.name,
        "link": recruiter.link,
        "agency": recruiter.agency,
        "my_notes": recruiter.my_notes,
        "notes_log": notes_log,
        "created_at": (
            recruiter.created_at.isoformat() if recruiter.created_at else None
        ),
    }


SORT_FIELDS = {"name", "created_at"}


@router.get("", response_model=RecruiterListResponse)
def list_recruiters(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=100, description="Items per page"),
    sort: Optional[str] = Query("name", description="Sort field: name, created_at"),
    order: Optional[str] = Query("asc", description="Sort order: asc, desc"),
    q: Optional[str] = Query(None, description="Case-insensitive name search"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List recruiters for the current user with pagination and sorting."""
    sort_field = sort if sort in SORT_FIELDS else "name"
    order_desc = order and order.lower() == "desc"
    base_q = db.query(Recruiter).filter(Recruiter.user_id == current_user.id)
    if q and q.strip():
        base_q = base_q.filter(Recruiter.name.ilike(f"%{q.strip()}%"))
    total = base_q.count()
    col = getattr(Recruiter, sort_field)
    q = base_q.order_by(col.desc() if order_desc else col.asc())
    recruiters = q.offset((page - 1) * page_size).limit(page_size).all()
    result = []
    for r in recruiters:
        notes_log = get_notes_for_source(db, current_user.id, "recruiter", r.id)
        if not notes_log and r.notes_log:
            try:
                notes_log = json.loads(r.notes_log) if r.notes_log.strip() else []
            except (json.JSONDecodeError, TypeError):
                pass
        result.append(RecruiterRead(**_recruiter_to_read(r, notes_log)))
    return RecruiterListResponse(items=result, total=total)


@router.get("/{recruiter_id}", response_model=RecruiterRead)
def get_recruiter(
    recruiter_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single recruiter by ID."""
    recruiter = (
        db.query(Recruiter)
        .filter(Recruiter.id == recruiter_id, Recruiter.user_id == current_user.id)
        .first()
    )
    if not recruiter:
        raise HTTPException(status_code=404, detail="Recruiter not found")
    notes_log = get_notes_for_source(db, current_user.id, "recruiter", recruiter.id)
    if not notes_log and recruiter.notes_log:
        try:
            notes_log = (
                json.loads(recruiter.notes_log) if recruiter.notes_log.strip() else []
            )
        except (json.JSONDecodeError, TypeError):
            pass
    return RecruiterRead(**_recruiter_to_read(recruiter, notes_log))


@router.post("", response_model=RecruiterRead, status_code=201)
def create_recruiter(
    data: RecruiterCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new recruiter."""
    recruiter = Recruiter(
        user_id=current_user.id,
        name=data.name.strip(),
        link=data.link.strip() if data.link else None,
        agency=data.agency.strip() if data.agency else None,
        my_notes=data.my_notes.strip() if data.my_notes else None,
    )
    db.add(recruiter)
    try:
        db.commit()
        db.refresh(recruiter)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400, detail="Recruiter with this name already exists"
        )
    if data.initial_note and data.initial_note.strip():
        add_note(db, current_user.id, "recruiter", recruiter.id, data.initial_note)
    notes_log = get_notes_for_source(db, current_user.id, "recruiter", recruiter.id)
    return RecruiterRead(**_recruiter_to_read(recruiter, notes_log))


@router.post("/{recruiter_id}/notes", response_model=RecruiterRead)
def add_recruiter_note(
    recruiter_id: int,
    data: NoteAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a note to the recruiter."""
    recruiter = (
        db.query(Recruiter)
        .filter(Recruiter.id == recruiter_id, Recruiter.user_id == current_user.id)
        .first()
    )
    if not recruiter:
        raise HTTPException(status_code=404, detail="Recruiter not found")
    if not data.text.strip():
        raise HTTPException(status_code=400, detail="Note text cannot be empty")
    add_note(db, current_user.id, "recruiter", recruiter.id, data.text)
    notes_log = get_notes_for_source(db, current_user.id, "recruiter", recruiter.id)
    return RecruiterRead(**_recruiter_to_read(recruiter, notes_log))


@router.delete("/{recruiter_id}", status_code=204)
def delete_recruiter(
    recruiter_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a recruiter. Fails if used in applications - user must change those first."""
    recruiter = (
        db.query(Recruiter)
        .filter(Recruiter.id == recruiter_id, Recruiter.user_id == current_user.id)
        .first()
    )
    if not recruiter:
        raise HTTPException(status_code=404, detail="Recruiter not found")
    apps = (
        db.query(Application)
        .filter(
            Application.recruiter_id == recruiter_id,
            Application.user_id == current_user.id,
        )
        .all()
    )
    if apps:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "entity_in_use",
                "message": f"Cannot delete. This recruiter is used in {len(apps)} application(s). Edit those applications to use a different recruiter first.",
                "entity_type": "recruiter",
                "entity_name": recruiter.name,
                "application_count": len(apps),
            },
        )
    db.delete(recruiter)
    db.commit()
    return None
