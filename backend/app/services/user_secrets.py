"""CRUD for per-user encrypted secrets."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.user_secret import UserSecret
from app.services.secret_crypto import decrypt_secret, encrypt_secret, mask_api_key

PROVIDER_OPENAI = "openai"


def _get_row(db: Session, user_id: int, provider: str) -> UserSecret | None:
    return (
        db.query(UserSecret)
        .filter(UserSecret.user_id == user_id, UserSecret.provider == provider)
        .first()
    )


def get_user_secret_plaintext(db: Session, user_id: int, provider: str) -> str | None:
    row = _get_row(db, user_id, provider)
    if row is None or not (row.secret_encrypted or "").strip():
        return None
    return decrypt_secret(row.secret_encrypted)


def get_openai_key_status(db: Session, user_id: int) -> tuple[bool, str | None]:
    """Return (configured, masked_key)."""
    row = _get_row(db, user_id, PROVIDER_OPENAI)
    if row is None:
        return False, None
    try:
        plaintext = decrypt_secret(row.secret_encrypted)
    except ValueError:
        return True, "••••"
    masked = mask_api_key(plaintext)
    return bool(plaintext.strip()), masked or None


def set_user_secret(db: Session, user_id: int, provider: str, plaintext: str) -> None:
    ciphertext = encrypt_secret(plaintext.strip())
    row = _get_row(db, user_id, provider)
    now = datetime.utcnow()
    if row:
        row.secret_encrypted = ciphertext
        row.updated_at = now
    else:
        db.add(
            UserSecret(
                user_id=user_id,
                provider=provider,
                secret_encrypted=ciphertext,
                created_at=now,
                updated_at=now,
            )
        )
    db.commit()


def clear_user_secret(db: Session, user_id: int, provider: str) -> None:
    row = _get_row(db, user_id, provider)
    if row:
        db.delete(row)
        db.commit()
