"""Pydantic schemas for Application."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class ApplicationBase(BaseModel):
    company: str
    role: str
    recruiter: Optional[str] = None
    contact_notes: Optional[str] = None
    jd_text: Optional[str] = None
    notes_log: Optional[List[dict]] = None


class ApplicationCreate(BaseModel):
    company: str
    role: str
    recruiter: Optional[str] = None
    job_url: Optional[str] = None
    source: Optional[str] = None  # e.g. LinkedIn, company website


class ApplicationUpdate(BaseModel):
    company: Optional[str] = None
    role: Optional[str] = None
    recruiter: Optional[str] = None
    contact_notes: Optional[str] = None
    jd_text: Optional[str] = None
    job_url: Optional[str] = None


class ApplicationRead(ApplicationBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    uuid: str
    company_id: int
    recruiter_id: Optional[int] = None
    recruiter_link: Optional[str] = None
    job_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ApplicationListRead(ApplicationRead):
    """Application with latest stage for list view."""

    latest_stage_type: Optional[str] = None
    latest_stage_at: Optional[datetime] = (
        None  # When latest stage occurred (for sort + display with time)
    )
    latest_stage_activity_type: Optional[str] = None  # call, hometest, pair_programming
