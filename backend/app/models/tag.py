"""Tag for learning centre (per-user vocabulary)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db import Base


class LearningTag(Base):
    """Topic label attached to learning items."""

    __tablename__ = "learning_tags"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_learning_tags_user_name"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name = Column(String(255), nullable=False)
    status = Column(String(32), nullable=False, default="draft")
    source = Column(String(32), nullable=False, default="user_created")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    learning_items = relationship(
        "LearningItem",
        secondary="learning_item_tags",
        back_populates="tags",
    )
