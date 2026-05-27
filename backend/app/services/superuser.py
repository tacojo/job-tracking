"""Superuser allowlist (comma-separated emails in SUPERUSER_EMAILS)."""

from app.config import settings
from app.models import User


def superuser_emails_set() -> set[str]:
    raw = settings.superuser_emails or ""
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def is_superuser_email(email: str) -> bool:
    allowed = superuser_emails_set()
    if not allowed:
        return False
    return email.strip().lower() in allowed


def is_superuser(user: User) -> bool:
    return is_superuser_email(user.email)
