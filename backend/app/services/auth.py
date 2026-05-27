"""Authentication: JWT creation and validation."""

from datetime import datetime, timedelta
from typing import Optional

from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.models import User
from app.services.user_defaults import ensure_user_defaults


def create_access_token(user_id: int) -> str:
    """Create a JWT for the user."""
    expire = datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> Optional[int]:
    """Decode JWT and return user_id, or None if invalid."""
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        return int(payload.get("sub", 0))
    except (JWTError, ValueError):
        return None


def get_or_create_user(
    db: Session,
    google_id: str,
    email: str,
    name: Optional[str] = None,
    picture: Optional[str] = None,
) -> User:
    """Get existing user by google_id or create new one."""
    user = db.query(User).filter(User.google_id == google_id).first()
    if user:
        user.email = email
        user.name = name
        user.picture = picture
        db.commit()
        db.refresh(user)
        ensure_user_defaults(db, user.id)
        return user
    user = User(google_id=google_id, email=email, name=name, picture=picture)
    db.add(user)
    db.commit()
    db.refresh(user)
    ensure_user_defaults(db, user.id)
    return user
