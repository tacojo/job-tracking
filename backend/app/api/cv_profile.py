"""CV profile API: parse CV, CRUD experiences, export to DOCX/PDF."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models import CvExperience, CvProfile, CVVersion, User
from app.services import storage
from app.services.cv_export import export_docx, export_pdf, list_templates
from app.services.cv_parser import parse_cv

router = APIRouter(prefix="/api/cv-profile", tags=["cv-profile"])


# --- Helpers ---


def _parse_month_year(value: str) -> Optional[Tuple[int, int]]:
    """
    Parse a month+year string into (year, month).

    Accepted examples:
    - "Oct 2022"
    - "October 2022"
    - "2022-10"
    - "2022"
    Special values:
    - "", "present", "current" -> None (handled separately by callers)
    """
    if not value:
        return None
    s = value.strip()
    if not s:
        return None
    if s.lower() in {"present", "current"}:
        return None

    # Try common formats first: "Oct 2022", "October 2022"
    for fmt in ("%b %Y", "%B %Y"):
        try:
            dt = datetime.strptime(s, fmt)
            return dt.year, dt.month
        except ValueError:
            pass

    # "2022-10"
    try:
        dt = datetime.strptime(s, "%Y-%m")
        return dt.year, dt.month
    except ValueError:
        pass

    # "2022" (year only)
    try:
        dt = datetime.strptime(s, "%Y")
        return dt.year, 1
    except ValueError:
        pass

    raise ValueError("Date must be month and year, e.g. 'Oct 2022' or '2022-10'.")


def _normalise_month_year(value: str) -> str:
    """Normalise month/year strings to 'Mon YYYY' while preserving 'Present' / empty."""
    if not value:
        return ""
    s = value.strip()
    if not s:
        return ""
    if s.lower() in {"present", "current"}:
        return "Present"
    year_month = _parse_month_year(s)
    if not year_month:
        return ""
    year, month = year_month
    return datetime(year, month, 1).strftime("%b %Y")


def _experience_sort_key(e: CvExperience) -> Tuple[int, int, int]:
    """
    Sort newest to oldest.
    Key: (is_present, end_year, end_month) where is_present=1 for 'Present'.
    Fallback to start_date if end_date is empty.
    """
    end_raw = (e.end_date or "").strip()
    start_raw = (e.start_date or "").strip()

    is_present = 1 if end_raw.lower() in {"present", "current"} else 0
    end_parsed = _parse_month_year(end_raw) or _parse_month_year(start_raw) or (0, 0)
    end_year, end_month = end_parsed
    # Newest first -> higher is_present, higher year, higher month
    return is_present, end_year, end_month


# --- Schemas ---


class ExperienceCreate(BaseModel):
    employer: str = ""
    employer_link: str = ""
    role: str = ""
    start_date: str = ""
    end_date: str = ""
    flag: str = "gb"
    location: str = ""
    employment_type: str = "Full time"
    duration: str = "Permanent"
    level: str = "Mid level"
    skills: list[str] = Field(default_factory=list)
    details: list[str] = Field(default_factory=list)

    @field_validator("start_date", "end_date")
    @classmethod
    def validate_dates(cls, v: str) -> str:
        # Allow empty
        if not v or not v.strip():
            return ""
        # Normalise and validate
        return _normalise_month_year(v)


class ExperienceUpdate(BaseModel):
    employer: str | None = None
    employer_link: str | None = None
    role: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    flag: str | None = None
    location: str | None = None
    employment_type: str | None = None
    duration: str | None = None
    level: str | None = None
    skills: list[str] | None = None
    details: list[str] | None = None

    @field_validator("start_date", "end_date")
    @classmethod
    def validate_dates(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        if not v.strip():
            return ""
        return _normalise_month_year(v)


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    tagline: str | None = None
    summary: str | None = None


def _experience_to_dict(e: CvExperience) -> dict[str, Any]:
    return {
        "id": e.id,
        "employer": e.employer,
        "employer_link": e.employer_link or "",
        "role": e.role,
        "start_date": e.start_date or "",
        "end_date": e.end_date or "",
        "flag": e.flag or "gb",
        "location": e.location or "",
        "employment_type": e.employment_type or "Full time",
        "duration": e.duration or "Permanent",
        "level": e.level or "Mid level",
        "skills": e.skills or [],
        "details": e.details or [],
        "sort_order": e.sort_order,
    }


def _get_or_create_profile(db: Session, user_id: int) -> CvProfile:
    p = db.query(CvProfile).filter(CvProfile.user_id == user_id).first()
    if not p:
        p = CvProfile(user_id=user_id)
        db.add(p)
        db.commit()
        db.refresh(p)
    return p


# --- Parse ---


@router.post("/parse/{cv_id}")
def parse_from_cv(
    cv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Parse an uploaded CV and populate the CV profile/experience table. Replaces existing data."""
    cv = (
        db.query(CVVersion)
        .filter(CVVersion.id == cv_id, CVVersion.user_id == current_user.id)
        .first()
    )
    if not cv:
        raise HTTPException(status_code=404, detail="CV not found")

    content = storage.read_file(cv.file_path)
    experiences, profile_data = parse_cv(content, cv.file_type)

    # Update profile
    prof = _get_or_create_profile(db, current_user.id)
    if profile_data.get("full_name"):
        prof.full_name = profile_data["full_name"]
    if profile_data.get("tagline"):
        prof.tagline = profile_data["tagline"]
    if profile_data.get("summary"):
        prof.summary = profile_data["summary"]
    db.commit()

    # Delete existing experiences and insert new (newest first based on dates)
    db.query(CvExperience).filter(CvExperience.user_id == current_user.id).delete()

    normalised: list[dict[str, Any]] = []
    for exp in experiences:
        start_raw = exp.get("start_date", "") or ""
        end_raw = exp.get("end_date", "") or ""
        try:
            start_norm = _normalise_month_year(start_raw) if start_raw else ""
        except ValueError:
            start_norm = start_raw
        try:
            end_norm = _normalise_month_year(end_raw) if end_raw else ""
        except ValueError:
            end_norm = end_raw
        exp = exp.copy()
        exp["start_date"] = start_norm
        exp["end_date"] = end_norm
        normalised.append(exp)

    # Sort newest to oldest using the same key helper
    def _key_dict(d: dict[str, Any]) -> Tuple[int, int, int]:
        class _Tmp:
            start_date = d.get("start_date", "")
            end_date = d.get("end_date", "")

        return _experience_sort_key(_Tmp)  # type: ignore[arg-type]

    normalised.sort(key=_key_dict, reverse=True)

    for i, exp in enumerate(normalised):
        e = CvExperience(
            user_id=current_user.id,
            employer=exp.get("employer", "Unknown"),
            employer_link=exp.get("employer_link", ""),
            role=exp.get("role", "Unknown"),
            start_date=exp.get("start_date", ""),
            end_date=exp.get("end_date", ""),
            flag=exp.get("flag", "gb"),
            location=exp.get("location", ""),
            employment_type=exp.get("employment_type", "Full time"),
            duration=exp.get("duration", "Permanent"),
            level=exp.get("level", "Mid level"),
            skills=exp.get("skills", []),
            details=exp.get("details", []),
            sort_order=i,
        )
        db.add(e)
    db.commit()

    return {"parsed": len(experiences), "profile_updated": bool(profile_data)}


# --- Profile ---


@router.get("/profile")
def get_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the user's CV profile."""
    prof = db.query(CvProfile).filter(CvProfile.user_id == current_user.id).first()
    if not prof:
        return {"full_name": "", "tagline": "", "summary": ""}
    return {
        "full_name": prof.full_name or "",
        "tagline": prof.tagline or "",
        "summary": prof.summary or "",
    }


@router.put("/profile")
def update_profile(
    data: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update the user's CV profile."""
    prof = _get_or_create_profile(db, current_user.id)
    if data.full_name is not None:
        prof.full_name = data.full_name
    if data.tagline is not None:
        prof.tagline = data.tagline
    if data.summary is not None:
        prof.summary = data.summary
    db.commit()
    db.refresh(prof)
    return {
        "full_name": prof.full_name or "",
        "tagline": prof.tagline or "",
        "summary": prof.summary or "",
    }


# --- Experiences ---


@router.get("/experiences")
def list_experiences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List CV experiences in chronological order (most recent first)."""
    rows = db.query(CvExperience).filter(CvExperience.user_id == current_user.id).all()
    # Sort newest to oldest using parsed dates; fall back to sort_order if needed
    sorted_rows = sorted(rows, key=_experience_sort_key, reverse=True)
    return [_experience_to_dict(e) for e in sorted_rows]


@router.post("/experiences", status_code=201)
def create_experience(
    data: ExperienceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new experience entry."""
    # Normalise dates for consistent ordering
    start_date = data.start_date or ""
    end_date = data.end_date or ""
    e = CvExperience(
        user_id=current_user.id,
        employer=data.employer,
        employer_link=data.employer_link,
        role=data.role,
        start_date=start_date,
        end_date=end_date,
        flag=data.flag,
        location=data.location,
        employment_type=data.employment_type,
        duration=data.duration,
        level=data.level,
        skills=data.skills,
        details=data.details,
        # sort_order is maintained logically by date; keep insertion order as a tiebreaker
        sort_order=0,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return _experience_to_dict(e)


@router.put("/experiences/{exp_id}")
def update_experience(
    exp_id: int,
    data: ExperienceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an experience entry."""
    e = (
        db.query(CvExperience)
        .filter(CvExperience.id == exp_id, CvExperience.user_id == current_user.id)
        .first()
    )
    if not e:
        raise HTTPException(status_code=404, detail="Experience not found")

    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(e, k, v)
    db.commit()
    db.refresh(e)
    return _experience_to_dict(e)


@router.delete("/experiences/{exp_id}", status_code=204)
def delete_experience(
    exp_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an experience entry."""
    e = (
        db.query(CvExperience)
        .filter(CvExperience.id == exp_id, CvExperience.user_id == current_user.id)
        .first()
    )
    if not e:
        raise HTTPException(status_code=404, detail="Experience not found")
    db.delete(e)
    db.commit()
    return None


# --- Export ---


@router.get("/export")
def export_cv(
    format: str = Query(..., pattern="^(docx|pdf)$"),
    template: str = Query("default", alias="template"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export CV to DOCX or PDF using the profile and experiences table."""
    prof = db.query(CvProfile).filter(CvProfile.user_id == current_user.id).first()
    profile_data = (
        {
            "full_name": prof.full_name or "",
            "tagline": prof.tagline or "",
            "summary": prof.summary or "",
        }
        if prof
        else {"full_name": "", "tagline": "", "summary": ""}
    )

    rows = db.query(CvExperience).filter(CvExperience.user_id == current_user.id).all()
    # Newest to oldest using the same date-based helper
    sorted_rows = sorted(rows, key=_experience_sort_key, reverse=True)
    experiences = [
        {
            "employer": e.employer,
            "employer_link": e.employer_link or "",
            "role": e.role,
            "start_date": e.start_date or "",
            "end_date": e.end_date or "",
            "flag": e.flag or "gb",
            "location": e.location or "",
            "employment_type": e.employment_type or "Full time",
            "duration": e.duration or "Permanent",
            "level": e.level or "Mid level",
            "skills": e.skills or [],
            "details": e.details or [],
        }
        for e in sorted_rows
    ]

    try:
        if format == "docx":
            content = export_docx(profile_data, experiences, template)
            media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            filename = "cv.docx"
        else:
            content = export_pdf(profile_data, experiences, template)
            media_type = "application/pdf"
            filename = "cv.pdf"
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/templates")
def get_templates(format: str = Query(..., pattern="^(docx|pdf)$")):
    """List available template names for a format (pdf uses html templates)."""
    return {"templates": list_templates("html" if format == "pdf" else format)}


@router.get("/export/json")
def export_json(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export CV profile and experiences as JSON (for tacojo.github.io or other consumers)."""
    prof = db.query(CvProfile).filter(CvProfile.user_id == current_user.id).first()
    profile_data = (
        {
            "full_name": prof.full_name or "",
            "tagline": prof.tagline or "",
            "summary": prof.summary or "",
        }
        if prof
        else {"full_name": "", "tagline": "", "summary": ""}
    )

    rows = (
        db.query(CvExperience)
        .filter(CvExperience.user_id == current_user.id)
        .order_by(CvExperience.sort_order.desc())
        .all()
    )
    experiences = [
        {
            "employer": e.employer,
            "employer_link": e.employer_link or "",
            "role": e.role,
            "start_date": e.start_date or "",
            "end_date": e.end_date or "",
            "flag": e.flag or "gb",
            "location": e.location or "",
            "type": e.employment_type or "Full time",
            "duration": e.duration or "Permanent",
            "level": e.level or "Mid level",
            "skills": e.skills or [],
            "details": e.details or [],
        }
        for e in rows
    ]
    return {"profile": profile_data, "experiences": experiences}
