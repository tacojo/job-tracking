"""Recruiter model - user's list of recruiters for dropdowns."""

from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)

from app.db import Base


class Recruiter(Base):
    """Recruiter entity - user-defined list for application dropdowns."""

    __tablename__ = "recruiters"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name = Column(String(255), nullable=False)
    email = Column(
        String(255), nullable=True
    )  # For UNIQUE(user_id, email) - prevents cross-user collisions
    link = Column(String(500), nullable=True)
    agency = Column(String(255), nullable=True)  # Recruiter's agency/company
    my_notes = Column(
        Text, nullable=True
    )  # Legacy free-form; notes_log is the chronological log
    notes_log = Column(Text, nullable=True)  # JSON array of {timestamp, text}
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_user_recruiter_name"),
        UniqueConstraint(
            "user_id", "email", name="uq_user_recruiter_email"
        ),  # email scoped by user
    )
