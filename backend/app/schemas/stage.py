"""Pydantic schemas for Stage."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class StageBase(BaseModel):
    stage_type: str
    notes: Optional[str] = None
    feedback: Optional[str] = None
    scheduled_at: Optional[datetime] = None  # Date and optional time
    activity_type: Optional[str] = None  # call, hometest, pair_programming
    contact_name: Optional[str] = None
    contact_linkedin: Optional[str] = None


class StageCreate(StageBase):
    pass


class StageUpdate(BaseModel):
    stage_type: Optional[str] = None
    notes: Optional[str] = None
    feedback: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    activity_type: Optional[str] = None
    contact_name: Optional[str] = None
    contact_linkedin: Optional[str] = None


class StageRead(StageBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    application_id: int
    scheduled_at: Optional[datetime] = None
    created_at: datetime
