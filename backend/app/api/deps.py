"""Shared dependencies for API routes."""

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.services.auth import decode_access_token
from app.services.superuser import is_superuser


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    """Require valid JWT (Authorization header or cookie); return current user or raise 401."""
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("auth_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    user_id = decode_access_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found.")

    return user


def get_superuser(
    current_user: User = Depends(get_current_user),
) -> User:
    """Require authenticated superuser (email in SUPERUSER_EMAILS)."""
    if not is_superuser(current_user):
        raise HTTPException(status_code=403, detail="Forbidden.")
    return current_user
