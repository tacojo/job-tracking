"""CV experience/role model - editable source of truth for CV content."""

from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String

from app.db import Base


class CvExperience(Base):
    """One role/experience entry in the user's CV (chronological, editable)."""

    __tablename__ = "cv_experiences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    employer = Column(String(255), nullable=False)
    employer_link = Column(String(512), default="")
    role = Column(String(255), nullable=False)
    start_date = Column(String(64), default="")  # e.g. "Oct 2022"
    end_date = Column(String(64), default="")  # e.g. "Feb 2023"
    flag = Column(String(8), default="gb")  # country code for flag icon
    location = Column(String(255), default="")
    employment_type = Column(String(64), default="Full time")
    duration = Column(String(64), default="Permanent")
    level = Column(String(64), default="Mid level")
    skills = Column(JSON, default=list)  # ["Python", "PostgreSQL", ...]
    details = Column(JSON, default=list)  # ["Bullet point 1", "Bullet point 2", ...]
    sort_order = Column(Integer, default=0)  # higher = more recent
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
