"""CV profile model - user-level summary and metadata for CV."""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.db import Base


class CvProfile(Base):
    """User's CV profile (name, tagline, summary) - one per user."""

    __tablename__ = "cv_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    full_name = Column(String(255), default="")
    tagline = Column(String(255), default="")  # e.g. "data engineer"
    summary = Column(Text, default="")  # profile paragraph
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
