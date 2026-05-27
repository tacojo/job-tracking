"""Prospect question model - editable list of questions for AI-generated answers."""

from sqlalchemy import Column, ForeignKey, Integer, String

from app.db import Base


class ProspectQuestion(Base):
    """Per-user question used as prompt for AI-generated prospect answers."""

    __tablename__ = "prospect_questions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_text = Column(String(512), nullable=False)
    sort_order = Column(Integer, default=0)
