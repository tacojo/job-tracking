"""Applications CRUD API."""

import re
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.api.entities import (
    get_or_create_company,
    get_or_create_recruiter,
    get_or_create_role,
)
from app.api.notes import add_note, get_notes_for_source
from app.db import get_db
from app.models import (
    Application,
    ApplicationNote,
    Company,
    JobDescription,
    Recruiter,
    Role,
    Stage,
    User,
)
from app.schemas import (
    ApplicationCreate,
    ApplicationListRead,
    ApplicationRead,
    ApplicationUpdate,
    NoteAdd,
)

router = APIRouter(prefix="/api/applications", tags=["applications"])


def _contact_notes_from_app(app: Application) -> str | None:
    """First application note as contact_notes for API compat."""
    notes = (
        sorted(app.application_notes, key=lambda n: n.created_at or "")
        if app.application_notes
        else []
    )
    return notes[0].note if notes else None


def _app_to_read(app: Application, notes_log: list | None = None) -> dict:
    """Build read dict with company/role/recruiter from dimension tables."""
    company = app.company_rel.name if app.company_rel else "Unknown"
    role = app.role_rel.name if app.role_rel else "Unknown"
    recruiter = app.recruiter_rel.name if app.recruiter_rel else None
    return {
        "id": app.id,
        "uuid": app.uuid,
        "company_id": app.company_id,
        "company": company,
        "role": role,
        "recruiter": recruiter,
        "recruiter_id": app.recruiter_id,
        "recruiter_link": app.recruiter_rel.link if app.recruiter_rel else None,
        "contact_notes": _contact_notes_from_app(app),
        "jd_text": app.job_description.text if app.job_description else None,
        "job_url": app.job_description.source_url if app.job_description else None,
        "created_at": app.created_at,
        "updated_at": app.updated_at,
        "notes_log": notes_log if notes_log is not None else [],
    }


def _slugify(text: str) -> str:
    """Match frontend slugify: lowercase, alphanumeric+hyphens only."""
    if not text:
        return ""
    s = re.sub(r"[^\w\s-]", "", str(text).lower().strip())
    s = re.sub(r"[\s_-]+", "-", s)
    return re.sub(r"^-+|-+$", "", s)


def _format_date_for_url(dt: datetime) -> str:
    """Format as YYYY-MM-DD to match frontend."""
    return dt.strftime("%Y-%m-%d") if dt else ""


@router.get("", response_model=list[ApplicationListRead])
def list_applications(
    company: Optional[str] = Query(
        None, description="Filter by company (partial match)"
    ),
    role: Optional[str] = Query(None, description="Filter by role (partial match)"),
    recruiter: Optional[str] = Query(
        None, description="Filter by recruiter (partial match)"
    ),
    stage: Optional[str] = Query(
        None, description="Filter by stage type (e.g. APPLIED, OFFER)"
    ),
    stage_mode: str = Query(
        "latest",
        pattern="^(latest|ever)$",
        description="Stage filter mode: latest or ever",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List applications for the current user, with optional filters and latest stage."""
    q = (
        db.query(Application)
        .options(
            joinedload(Application.stages),
            joinedload(Application.company_rel),
            joinedload(Application.recruiter_rel),
            joinedload(Application.role_rel),
            joinedload(Application.job_description),
            joinedload(Application.application_notes),
        )
        .filter(
            Application.user_id == current_user.id,
            Application.deleted_at.is_(None),
        )
    )

    if company:
        q = q.filter(Application.company_rel.has(Company.name.ilike(f"%{company}%")))
    if role:
        q = q.filter(Application.role_rel.has(Role.name.ilike(f"%{role}%")))
    if recruiter:
        q = q.filter(
            Application.recruiter_rel.has(Recruiter.name.ilike(f"%{recruiter}%"))
        )
    if stage:
        if stage_mode == "ever":
            # Include applications that reached this stage at any point.
            subq = (
                db.query(Stage.application_id)
                .filter(
                    Stage.stage_type == stage,
                    Stage.user_id == current_user.id,
                )
                .distinct()
            )
            q = q.filter(Application.id.in_(subq))

    apps = q.order_by(Application.updated_at.desc()).all()
    result = []
    for app in apps:
        latest = (
            max(app.stages, key=lambda s: s.scheduled_at or s.created_at)
            if app.stages
            else None
        )
        if (
            stage
            and stage_mode == "latest"
            and (not latest or latest.stage_type != stage)
        ):
            continue
        base = _app_to_read(app)
        latest_dt = latest.scheduled_at or latest.created_at if latest else None
        result.append(
            ApplicationListRead(
                **base,
                latest_stage_type=latest.stage_type if latest else None,
                latest_stage_at=latest_dt if latest_dt else None,
                latest_stage_activity_type=latest.activity_type if latest else None,
            )
        )
    return result


@router.post("", response_model=ApplicationRead, status_code=201)
def create_application(
    data: ApplicationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new application. Automatically creates Applied event and sets status=applied."""
    company = get_or_create_company(db, current_user.id, data.company)
    role = get_or_create_role(db, current_user.id, data.role)
    recruiter = (
        get_or_create_recruiter(db, current_user.id, data.recruiter)
        if data.recruiter
        else None
    )
    app = Application(
        user_id=current_user.id,
        company_id=company.id,
        role_id=role.id,
        recruiter_id=recruiter.id if recruiter else None,
    )
    db.add(app)
    db.flush()
    if data.source:
        db.add(
            ApplicationNote(
                application_id=app.id, user_id=current_user.id, note=data.source
            )
        )
    if data.job_url:
        db.add(
            JobDescription(
                application_id=app.id,
                user_id=current_user.id,
                text=None,
                source_url=data.job_url,
            )
        )
    db.commit()
    db.refresh(app)
    db.refresh(app, ["company_rel", "recruiter_rel", "role_rel", "job_description"])
    return ApplicationRead(**_app_to_read(app))


@router.get(
    "/slug/{company_slug}/{role_slug}/{date_slug}", response_model=ApplicationRead
)
def get_application_by_slug(
    company_slug: str,
    role_slug: str,
    date_slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get application by URL slug (company/role/date)."""
    apps = (
        db.query(Application)
        .options(
            joinedload(Application.company_rel),
            joinedload(Application.recruiter_rel),
            joinedload(Application.role_rel),
            joinedload(Application.job_description),
            joinedload(Application.application_notes),
        )
        .filter(
            Application.user_id == current_user.id,
            Application.deleted_at.is_(None),
        )
        .order_by(Application.updated_at.desc())
        .all()
    )
    for app in apps:
        c = app.company_rel.name if app.company_rel else ""
        r = app.role_rel.name if app.role_rel else ""
        if (
            _slugify(c) == company_slug
            and _slugify(r) == role_slug
            and _format_date_for_url(app.updated_at) == date_slug
        ):
            return ApplicationRead(**_app_to_read(app))
    raise HTTPException(status_code=404, detail="Application not found")


@router.post("/{app_id}/notes", response_model=ApplicationRead)
def add_application_note(
    app_id: str,
    data: NoteAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a note to the application."""
    q = (
        db.query(Application)
        .options(
            joinedload(Application.company_rel),
            joinedload(Application.recruiter_rel),
            joinedload(Application.role_rel),
            joinedload(Application.job_description),
            joinedload(Application.application_notes),
        )
        .filter(
            Application.user_id == current_user.id,
            Application.deleted_at.is_(None),
        )
    )
    if app_id.isdigit():
        app = q.filter(Application.id == int(app_id)).first()
    else:
        app = q.filter(Application.uuid == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if not data.text.strip():
        raise HTTPException(status_code=400, detail="Note text cannot be empty")
    add_note(db, current_user.id, "application", app.id, data.text)
    notes_log = get_notes_for_source(db, current_user.id, "application", app.id)
    return ApplicationRead(**_app_to_read(app, notes_log))


@router.get("/{app_id}", response_model=ApplicationRead)
def get_application(
    app_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single application by UUID or integer ID."""
    q = (
        db.query(Application)
        .options(
            joinedload(Application.company_rel),
            joinedload(Application.recruiter_rel),
            joinedload(Application.role_rel),
            joinedload(Application.job_description),
            joinedload(Application.application_notes),
        )
        .filter(
            Application.user_id == current_user.id,
            Application.deleted_at.is_(None),
        )
    )
    if app_id.isdigit():
        app = q.filter(Application.id == int(app_id)).first()
    else:
        app = q.filter(Application.uuid == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    notes_log = get_notes_for_source(db, current_user.id, "application", app.id)
    return ApplicationRead(**_app_to_read(app, notes_log))


@router.put("/{app_id}", response_model=ApplicationRead)
def update_application(
    app_id: str,
    data: ApplicationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an application."""
    q = (
        db.query(Application)
        .options(
            joinedload(Application.company_rel),
            joinedload(Application.recruiter_rel),
            joinedload(Application.role_rel),
            joinedload(Application.job_description),
            joinedload(Application.application_notes),
        )
        .filter(
            Application.user_id == current_user.id,
            Application.deleted_at.is_(None),
        )
    )
    if app_id.isdigit():
        app = q.filter(Application.id == int(app_id)).first()
    else:
        app = q.filter(Application.uuid == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    d = data.model_dump(exclude_unset=True)
    if "company" in d:
        company = get_or_create_company(db, current_user.id, d["company"])
        app.company_id = company.id
    if "role" in d:
        role = get_or_create_role(db, current_user.id, d["role"])
        app.role_id = role.id
    if "recruiter" in d:
        recruiter = get_or_create_recruiter(db, current_user.id, d.get("recruiter"))
        app.recruiter_id = recruiter.id if recruiter else None
    if "contact_notes" in d:
        notes = sorted(app.application_notes, key=lambda n: n.created_at or "")
        if notes:
            if d["contact_notes"]:
                notes[0].note = d["contact_notes"]
            else:
                db.delete(notes[0])
        elif d["contact_notes"]:
            db.add(
                ApplicationNote(
                    application_id=app.id,
                    user_id=current_user.id,
                    note=d["contact_notes"],
                )
            )
    if "jd_text" in d or "job_url" in d:
        text_val = (
            d.get("jd_text")
            if "jd_text" in d
            else (app.job_description.text if app.job_description else None)
        )
        url_val = (
            d.get("job_url")
            if "job_url" in d
            else (app.job_description.source_url if app.job_description else None)
        )
        if app.job_description:
            if "jd_text" in d:
                app.job_description.text = d["jd_text"] or None
            if "job_url" in d:
                app.job_description.source_url = d["job_url"] or None
        elif text_val or url_val:
            db.add(
                JobDescription(
                    application_id=app.id,
                    user_id=current_user.id,
                    text=text_val,
                    source_url=url_val,
                    created_by=current_user.id,
                )
            )
    db.commit()
    db.refresh(app)
    db.refresh(app, ["company_rel", "recruiter_rel", "role_rel", "job_description"])
    notes_log = get_notes_for_source(db, current_user.id, "application", app.id)
    return ApplicationRead(**_app_to_read(app, notes_log))


@router.delete("/{app_id}", status_code=204)
def delete_application(
    app_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft-delete an application by setting deleted_at."""
    base_q = db.query(Application).filter(
        Application.user_id == current_user.id,
        Application.deleted_at.is_(None),
    )
    if app_id.isdigit():
        app = base_q.filter(Application.id == int(app_id)).first()
    else:
        app = base_q.filter(Application.uuid == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    app.deleted_at = datetime.utcnow()
    db.commit()
    return None
