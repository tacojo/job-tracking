"""Role model - dimension for job titles."""

from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint

from app.db import Base


class Role(Base):
    """Role dimension - job titles used in applications (user-scoped)."""

    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name = Column(String(255), nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_user_role_name"),)
