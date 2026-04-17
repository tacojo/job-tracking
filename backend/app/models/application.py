"""Application model - clean schema. FKs only, no duplicated text. Use uuid for API."""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.db import Base


class Application(Base):
    """Job application - id for joins, uuid for API. Status is source of truth."""

    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(
        String(36),
        unique=True,
        nullable=False,
        index=True,
        default=lambda: str(uuid.uuid4()),
    )
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    company_id = Column(
        Integer,
        ForeignKey("companies.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    role_id = Column(
        Integer, ForeignKey("roles.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    recruiter_id = Column(
        Integer,
        ForeignKey("recruiters.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    deleted_at = Column(DateTime, nullable=True)  # Soft-delete
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    stages = relationship(
        "Stage", back_populates="application", cascade="all, delete-orphan"
    )
    user = relationship("User", backref="applications")
    company_rel = relationship(
        "Company", foreign_keys=[company_id], backref="applications"
    )
    recruiter_rel = relationship(
        "Recruiter", foreign_keys=[recruiter_id], backref="applications"
    )
    role_rel = relationship("Role", foreign_keys=[role_id], backref="applications")
    job_description = relationship(
        "JobDescription",
        back_populates="application",
        uselist=False,
        cascade="all, delete-orphan",
    )
