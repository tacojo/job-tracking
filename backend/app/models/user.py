"""User model for authentication."""

from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String

from app.db import Base


class User(Base):
    """User entity (from Google OAuth)."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    google_id = Column(String(255), unique=True, nullable=False, index=True)
    email = Column(String(255), nullable=False, index=True)
    name = Column(String(255), nullable=True)
    picture = Column(String(512), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
