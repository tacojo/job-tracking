"""Application SWOT Analysis - stores preserved SWOT analyses for applications."""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import relationship

from app.db import Base


class ApplicationSwotAnalysis(Base):
    """Stores a preserved SWOT analysis for an application."""

    __tablename__ = "application_swot_analyses"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(
        Integer,
        ForeignKey("applications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    strengths = Column(Text, nullable=False)  # JSON array stored as text
    weaknesses = Column(Text, nullable=False)  # JSON array stored as text
    opportunities = Column(Text, nullable=False)  # JSON array stored as text
    threats = Column(Text, nullable=False)  # JSON array stored as text
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    application = relationship("Application", backref="swot_analyses")
