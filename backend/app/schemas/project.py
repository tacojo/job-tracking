"""Project schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ProjectCreate(BaseModel):
    title: str
    description: str


class ProjectUpdate(BaseModel):
    title: str
    description: str


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    created_at: datetime
    updated_at: datetime
