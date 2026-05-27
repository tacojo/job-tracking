"""Per-user encrypted credentials (e.g. OpenAI API keys)."""

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

from app.db import Base


class UserSecret(Base):
    """Encrypted secret for a provider, one row per (user, provider)."""

    __tablename__ = "user_secrets"
    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="uq_user_secrets_user_provider"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider = Column(String(32), nullable=False, index=True)
    secret_encrypted = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
