"""AI prompt settings stored in DB (editable on Settings page)."""

from sqlalchemy import Column, ForeignKey, Integer, String, Text, UniqueConstraint

from app.db import Base


class AiPrompt(Base):
    """Per-user key-value store for AI system prompts."""

    __tablename__ = "ai_prompts"
    __table_args__ = (
        UniqueConstraint("user_id", "key", name="uq_ai_prompts_user_key"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key = Column(String(64), nullable=False, index=True)
    value = Column(Text, nullable=False, default="")
