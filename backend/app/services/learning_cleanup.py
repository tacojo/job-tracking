"""Delete all learning-centre data for one user."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import (
    ConceptRelationship,
    LearningConcept,
    LearningItem,
    LearningItemReview,
    LearningTag,
)


def clear_learning_centre_for_user(db: Session, user_id: int) -> None:
    """
    Remove reviews, flashcards/notes with attachments, tags, concepts, concept edges for this user.
    Does not commit.
    """
    db.query(LearningItemReview).filter(LearningItemReview.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(ConceptRelationship).filter(ConceptRelationship.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(LearningItem).filter(LearningItem.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(LearningConcept).filter(LearningConcept.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(LearningTag).filter(LearningTag.user_id == user_id).delete(
        synchronize_session=False
    )
