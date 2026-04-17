"""Job description - big text separate from applications for performance."""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db import Base


class JobDescription(Base):
    """Job description text - one row per application, keeps applications table lean."""

    __tablename__ = "application_job_descriptions"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(
        Integer,
        ForeignKey("applications.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    text = Column(Text, nullable=True)
    source_url = Column(String(500), nullable=True)  # URL of job post
    version = Column(
        Integer, nullable=False, default=1
    )  # For versioning when posts change
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    created_by = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    application = relationship(
        "Application", back_populates="job_description", uselist=False
    )
