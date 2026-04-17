"""Recruiter schemas."""

import json
from typing import Any, Optional

from pydantic import BaseModel, field_validator


class RecruiterCreate(BaseModel):
    name: str
    link: Optional[str] = None
    agency: Optional[str] = None
    my_notes: Optional[str] = None
    initial_note: Optional[str] = None  # First entry for notes_log when creating


class RecruiterRead(BaseModel):
    id: int
    name: str
    link: Optional[str] = None
    agency: Optional[str] = None
    my_notes: Optional[str] = None
    notes_log: Optional[list[dict[str, Any]]] = None  # [{timestamp, text}, ...]
    created_at: Optional[str] = None  # ISO datetime for display

    @field_validator("notes_log", mode="before")
    @classmethod
    def parse_notes_log(cls, v: Any) -> list:
        if v is None:
            return []
        if isinstance(v, str):
            return json.loads(v) if v.strip() else []
        return v or []

    class Config:
        from_attributes = True


class RecruiterListResponse(BaseModel):
    items: list[RecruiterRead]
    total: int
