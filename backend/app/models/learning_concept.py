"""Knowledge graph nodes (concepts), edges between concepts, and item–concept links."""

from __future__ import annotations

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
from sqlalchemy.orm import relationship

from app.db import Base


class LearningConcept(Base):
    """Knowledge graph node — explainable units, not filter tags."""

    __tablename__ = "learning_concepts"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_learning_concepts_user_name"),
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

    item_links = relationship(
        "LearningItemConcept",
        back_populates="concept",
    )


class LearningItemConcept(Base):
    """Association: flashcard/note ↔ concept plus per-item pedagogical metadata."""

    __tablename__ = "learning_item_concepts"

    learning_item_id = Column(
        Integer,
        ForeignKey("learning_items.id", ondelete="CASCADE"),
        primary_key=True,
    )
    concept_id = Column(
        Integer,
        ForeignKey("learning_concepts.id", ondelete="CASCADE"),
        primary_key=True,
    )
    concept_type = Column(String(64), nullable=True)
    importance = Column(String(32), nullable=True)

    learning_item = relationship("LearningItem", back_populates="concept_attachments")
    concept = relationship("LearningConcept", back_populates="item_links")


class ConceptRelationship(Base):
    """Directed edge: source concept → target concept."""

    __tablename__ = "concept_relationships"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_concept_id = Column(
        Integer,
        ForeignKey("learning_concepts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_concept_id = Column(
        Integer,
        ForeignKey("learning_concepts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    relation_type = Column(String(64), nullable=False)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    source_concept = relationship(
        "LearningConcept",
        foreign_keys=[source_concept_id],
    )
    target_concept = relationship(
        "LearningConcept",
        foreign_keys=[target_concept_id],
    )
