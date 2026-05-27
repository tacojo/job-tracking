"""Encrypt and decrypt user secrets at rest."""

from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

_fernet: Fernet | None = None


def _fernet_key_bytes() -> bytes:
    explicit = (settings.secrets_encryption_key or "").strip()
    if explicit:
        return explicit.encode("utf-8")
    if settings.bypass_auth or settings.debug:
        # Stable dev-only key derived from JWT secret (not for production).
        digest = hashlib.sha256(
            f"user-secrets:{settings.jwt_secret}".encode("utf-8")
        ).digest()
        return base64.urlsafe_b64encode(digest)
    raise ValueError(
        "SECRETS_ENCRYPTION_KEY is not configured. "
        'Generate one with: python -c "from cryptography.fernet import Fernet; '
        'print(Fernet.generate_key().decode())"'
    )


def _require_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_fernet_key_bytes())
    return _fernet


def encrypt_secret(plaintext: str) -> str:
    return _require_fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_secret(ciphertext: str) -> str:
    try:
        return _require_fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Failed to decrypt stored secret") from exc


def mask_api_key(key: str) -> str:
    key = (key or "").strip()
    if not key:
        return ""
    if len(key) <= 11:
        return "••••"
    return f"{key[:7]}...{key[-4:]}"
