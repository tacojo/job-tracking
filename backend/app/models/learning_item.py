"""Learning items (flashcards, notes), item–concept links, tags, reviews."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db import Base


class LearningItem(Base):
    """Polymorphic study unit (flashcard + note). Concepts attach via LearningItemConcept."""

    __tablename__ = "learning_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type = Column(String(32), nullable=False)
    title = Column(String(512), nullable=False)
    content = Column(Text, nullable=False)
    search_text = Column(Text, nullable=True)
    status = Column(String(32), nullable=False, default="draft")
    source = Column(String(32), nullable=False, default="user_created")
    source_topic = Column(String(512), nullable=True)
    notion_level = Column(String(32), nullable=False, default="intermediate")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tags = relationship(
        "LearningTag",
        secondary="learning_item_tags",
        back_populates="learning_items",
    )
    concept_attachments = relationship(
        "LearningItemConcept",
        back_populates="learning_item",
        cascade="all, delete-orphan",
    )


class LearningItemTag(Base):
    __tablename__ = "learning_item_tags"

    learning_item_id = Column(
        Integer,
        ForeignKey("learning_items.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tag_id = Column(
        Integer, ForeignKey("learning_tags.id", ondelete="CASCADE"), primary_key=True
    )


class LearningItemReview(Base):
    """Ease log for future SRS (V1 records button presses)."""

    __tablename__ = "learning_item_reviews"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    learning_item_id = Column(
        Integer,
        ForeignKey("learning_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ease = Column(String(16), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
