"""Schemas for reset / danger-zone API responses."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class BackupInfo(BaseModel):
    filename: str
    path: str
    absolute_path: str


class ResetAllResponse(BaseModel):
    message: str = "Reset complete."
    backup: Optional[BackupInfo] = None


class PurgeSoftDeletedResponse(BaseModel):
    purged_count: int


class SoftDeletedCountResponse(BaseModel):
    count: int


class SoftDeletedApplicationItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uuid: str
    company: str
    role: str
    deleted_at: datetime


class SoftDeletedListResponse(BaseModel):
    items: list[SoftDeletedApplicationItem]


class ClearLearningCentreResponse(BaseModel):
    """Response after wiping learning-centre tables for the current user."""

    message: str
