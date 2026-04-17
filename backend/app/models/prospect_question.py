"""Prospect question model - editable list of questions for AI-generated answers."""

from sqlalchemy import Column, Integer, String

from app.db import Base


class ProspectQuestion(Base):
    """A question used as prompt for AI-generated prospect answers (editable in DB)."""

    __tablename__ = "prospect_questions"

    id = Column(Integer, primary_key=True, index=True)
    question_text = Column(String(512), nullable=False)
    sort_order = Column(Integer, default=0)
