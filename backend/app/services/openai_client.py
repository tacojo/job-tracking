"""Shared OpenAI client resolution using per-user API keys."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.config import settings
from app.services.user_secrets import PROVIDER_OPENAI, get_user_secret_plaintext

MISSING_KEY_DETAIL = (
    "Add your OpenAI API key in Settings → AI settings to use this feature."
)


def resolve_openai_api_key(db: Session, user_id: int) -> str:
    from fastapi import HTTPException

    key = get_user_secret_plaintext(db, user_id, PROVIDER_OPENAI)
    if key and key.strip():
        return key.strip()
    raise HTTPException(status_code=503, detail=MISSING_KEY_DETAIL)


def get_openai_client(db: Session, user_id: int):
    from openai import OpenAI

    return OpenAI(api_key=resolve_openai_api_key(db, user_id))


def call_openai_text(
    db: Session,
    user_id: int,
    system_prompt: str,
    user_content: str,
    *,
    max_tokens: int = 4000,
) -> str:
    client = get_openai_client(db, user_id)
    response = client.chat.completions.create(
        model=settings.openai_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        max_tokens=max_tokens,
    )
    return (response.choices[0].message.content or "").strip()


def call_openai_json(
    db: Session,
    user_id: int,
    system_prompt: str,
    user_content: str,
    *,
    max_tokens: int = 4000,
) -> str:
    client = get_openai_client(db, user_id)
    response = client.chat.completions.create(
        model=settings.openai_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_object"},
        max_tokens=max_tokens,
    )
    return (response.choices[0].message.content or "").strip()
