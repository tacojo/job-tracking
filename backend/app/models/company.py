"""Company model - user's list of companies for dropdowns."""

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


class Company(Base):
    """Company entity - user-defined list for application dropdowns."""

    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name = Column(String(255), nullable=False)
    link = Column(String(500), nullable=True)
    my_notes = Column(
        Text, nullable=True
    )  # Legacy free-form; notes_log is the chronological log
    notes_log = Column(Text, nullable=True)  # JSON array of {timestamp, text}
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_user_company_name"),)
