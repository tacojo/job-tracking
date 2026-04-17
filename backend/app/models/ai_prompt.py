"""AI prompt settings stored in DB (editable on Settings page)."""

from sqlalchemy import Column, Integer, String, Text

from app.db import Base


class AiPrompt(Base):
    """Key-value store for AI system prompts (tailor CV, tailor cover letter, prospect answer)."""

    __tablename__ = "ai_prompts"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(64), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=False, default="")
