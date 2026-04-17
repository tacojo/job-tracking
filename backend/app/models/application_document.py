"""Application document - CV, cover letter, test, JD. First-class with full metadata."""

import uuid as uuid_lib
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db import Base


class ApplicationDocument(Base):
    """Document attached to an application. Full metadata for dedupe/integrity."""

    __tablename__ = "application_documents"

    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(
        String(36),
        unique=True,
        nullable=False,
        index=True,
        default=lambda: str(uuid_lib.uuid4()),
    )

    application_id = Column(
        Integer,
        ForeignKey("applications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    doc_type = Column(String(50), nullable=False)  # cv, cover_letter, jd, test, other
    version = Column(Integer, nullable=False, default=1)

    filename = Column(String(255), nullable=False)  # original display name
    storage_path = Column(String(500), nullable=False)  # relative path from files_root
    format = Column(
        String(20), nullable=False, default=""
    )  # pdf, docx, txt, zip; empty when unknown
    mime_type = Column(String(100), nullable=True)
    size_bytes = Column(Integer, nullable=True)
    sha256 = Column(String(64), nullable=True)  # optional dedupe/integrity

    storage_provider = Column(String(50), nullable=False, default="local")  # local, gcs
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    created_by = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    application = relationship("Application", backref="documents")

    __table_args__ = (
        UniqueConstraint(
            "application_id",
            "doc_type",
            "version",
            "format",
            name="uq_app_docs_type_version_format",
        ),
    )
