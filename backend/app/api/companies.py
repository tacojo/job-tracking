"""Companies CRUD API."""

import json
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.notes import add_note, get_notes_for_source
from app.db import get_db
from app.models import Application, Company, User
from app.schemas import CompanyCreate, CompanyListResponse, CompanyRead, NoteAdd

router = APIRouter(prefix="/api/companies", tags=["companies"])


def _company_to_read(company: Company, notes_log: list[dict[str, Any]]) -> dict:
    """Build CompanyRead dict with notes_log from notes table."""
    return {
        "id": company.id,
        "name": company.name,
        "link": company.link,
        "my_notes": company.my_notes,
        "notes_log": notes_log,
        "created_at": company.created_at.isoformat() if company.created_at else None,
    }


SORT_FIELDS = {"name", "created_at"}


@router.get("", response_model=CompanyListResponse)
def list_companies(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=100, description="Items per page"),
    sort: Optional[str] = Query("name", description="Sort field: name, created_at"),
    order: Optional[str] = Query("asc", description="Sort order: asc, desc"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List companies for the current user with pagination and sorting."""
    sort_field = sort if sort in SORT_FIELDS else "name"
    order_desc = order and order.lower() == "desc"
    base_q = db.query(Company).filter(Company.user_id == current_user.id)
    total = base_q.count()
    col = getattr(Company, sort_field)
    q = base_q.order_by(col.desc() if order_desc else col.asc())
    companies = q.offset((page - 1) * page_size).limit(page_size).all()
    result = []
    for c in companies:
        notes_log = get_notes_for_source(db, current_user.id, "company", c.id)
        if not notes_log and c.notes_log:
            try:
                notes_log = json.loads(c.notes_log) if c.notes_log.strip() else []
            except (json.JSONDecodeError, TypeError):
                pass
        result.append(CompanyRead(**_company_to_read(c, notes_log)))
    return CompanyListResponse(items=result, total=total)


@router.get("/{company_id}", response_model=CompanyRead)
def get_company(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single company by ID."""
    company = (
        db.query(Company)
        .filter(Company.id == company_id, Company.user_id == current_user.id)
        .first()
    )
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    notes_log = get_notes_for_source(db, current_user.id, "company", company.id)
    if not notes_log and company.notes_log:
        try:
            notes_log = (
                json.loads(company.notes_log) if company.notes_log.strip() else []
            )
        except (json.JSONDecodeError, TypeError):
            pass
    return CompanyRead(**_company_to_read(company, notes_log))


@router.post("", response_model=CompanyRead, status_code=201)
def create_company(
    data: CompanyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new company."""
    company = Company(
        user_id=current_user.id,
        name=data.name.strip(),
        link=data.link.strip() if data.link else None,
        my_notes=data.my_notes.strip() if data.my_notes else None,
    )
    db.add(company)
    try:
        db.commit()
        db.refresh(company)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400, detail="Company with this name already exists"
        )
    if data.initial_note and data.initial_note.strip():
        add_note(db, current_user.id, "company", company.id, data.initial_note)
    notes_log = get_notes_for_source(db, current_user.id, "company", company.id)
    return CompanyRead(**_company_to_read(company, notes_log))


@router.post("/{company_id}/notes", response_model=CompanyRead)
def add_company_note(
    company_id: int,
    data: NoteAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a note to the company."""
    company = (
        db.query(Company)
        .filter(Company.id == company_id, Company.user_id == current_user.id)
        .first()
    )
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if not data.text.strip():
        raise HTTPException(status_code=400, detail="Note text cannot be empty")
    add_note(db, current_user.id, "company", company.id, data.text)
    notes_log = get_notes_for_source(db, current_user.id, "company", company.id)
    return CompanyRead(**_company_to_read(company, notes_log))


@router.delete("/{company_id}", status_code=204)
def delete_company(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a company. Fails if used in applications - user must change those first."""
    company = (
        db.query(Company)
        .filter(Company.id == company_id, Company.user_id == current_user.id)
        .first()
    )
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    apps = (
        db.query(Application)
        .filter(
            Application.company_id == company_id, Application.user_id == current_user.id
        )
        .all()
    )
    if apps:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "entity_in_use",
                "message": f"Cannot delete. This company is used in {len(apps)} application(s). Edit those applications to use a different company first or delete applications for this company.",
                "entity_type": "company",
                "entity_name": company.name,
                "application_count": len(apps),
            },
        )
    db.delete(company)
    db.commit()
    return None
