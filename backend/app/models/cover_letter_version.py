"""Cover letter version model for uploaded cover letter files."""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.db import Base


class CoverLetterVersion(Base):
    """Uploaded cover letter file (PDF or DOCX)."""

    __tablename__ = "cover_letter_versions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=False)
    file_type = Column(String(20), nullable=False)  # pdf or docx
    created_at = Column(DateTime, default=datetime.utcnow)
