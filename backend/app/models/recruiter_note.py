"""Recruiter note - scales better than my_notes/notes_log on recruiters."""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import backref, relationship

from app.db import Base


class RecruiterNote(Base):
    """One note per row for a recruiter."""

    __tablename__ = "recruiter_notes"

    id = Column(Integer, primary_key=True, index=True)
    recruiter_id = Column(
        Integer,
        ForeignKey("recruiters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    note = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    created_by = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    recruiter = relationship(
        "Recruiter",
        backref=backref("recruiter_notes", passive_deletes="all"),
    )
