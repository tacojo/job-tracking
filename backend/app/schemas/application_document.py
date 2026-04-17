"""Application document schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ApplicationDocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    uuid: str
    application_id: int
    doc_type: str
    version: int
    filename: str
    format: str
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    created_at: datetime
