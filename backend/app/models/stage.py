"""Stage model for application pipeline."""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db import Base


class Stage(Base):
    """Pipeline stage for an application (table: application_events)."""

    __tablename__ = "application_events"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(
        Integer, ForeignKey("applications.id", ondelete="CASCADE"), nullable=False
    )
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stage_type = Column(
        String(50), nullable=False, index=True
    )  # APPLIED, RECRUITER_CALL, STAGE_1..5, OFFER, REJECTED
    notes = Column(Text, nullable=True)
    feedback = Column(Text, nullable=True)
    scheduled_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    activity_type = Column(
        String(50), nullable=True
    )  # call, hometest, pair_programming
    contact_name = Column(String(255), nullable=True)
    contact_linkedin = Column(String(500), nullable=True)  # LinkedIn profile URL

    application = relationship("Application", back_populates="stages")
