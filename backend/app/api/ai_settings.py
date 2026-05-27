"""AI settings: model (read-only), editable prompts, and per-user OpenAI API key."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.config import settings
from app.db import get_db
from app.models import AiPrompt, User
from app.services.user_defaults import ensure_user_ai_prompts
from app.services.user_secrets import (
    PROVIDER_OPENAI,
    clear_user_secret,
    get_openai_key_status,
    set_user_secret,
)

router = APIRouter(prefix="/api/settings/ai", tags=["ai-settings"])

PROMPT_KEYS = (
    "tailor_cv",
    "tailor_cover_letter",
    "prospect_answer",
    "learning_ask",
    "learning_generate_flashcards",
    "learning_refresh_flashcard",
    "learning_refresh_note",
    "learning_extract_concepts",
)


class AiSettingsResponse(BaseModel):
    model: str
    prompts: dict[str, str]
    openai_api_key_configured: bool
    openai_api_key_masked: str | None = None


class AiSettingsUpdate(BaseModel):
    prompts: dict[str, str] | None = None
    openai_api_key: str | None = None
    clear_openai_api_key: bool = False


def _prompts_from_db(db: Session, user_id: int) -> dict[str, str]:
    rows = (
        db.query(AiPrompt)
        .filter(
            AiPrompt.user_id == user_id,
            AiPrompt.key.in_(PROMPT_KEYS),
        )
        .all()
    )
    return {r.key: r.value for r in rows}


def _prompts_response(db: Session, user_id: int) -> dict[str, str]:
    prompts = _prompts_from_db(db, user_id)
    for key in PROMPT_KEYS:
        if key not in prompts:
            prompts[key] = ""
    return prompts


def _validate_openai_api_key(api_key: str) -> str:
    key = (api_key or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="OpenAI API key cannot be empty.")
    if not key.startswith("sk-"):
        raise HTTPException(
            status_code=400,
            detail="OpenAI API key should start with sk-.",
        )
    return key


def _build_response(db: Session, user_id: int) -> AiSettingsResponse:
    configured, masked = get_openai_key_status(db, user_id)
    return AiSettingsResponse(
        model=settings.openai_model,
        prompts=_prompts_response(db, user_id),
        openai_api_key_configured=configured,
        openai_api_key_masked=masked,
    )


@router.get("", response_model=AiSettingsResponse)
def get_ai_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return AI model (read-only), prompts, and OpenAI key status (masked)."""
    ensure_user_ai_prompts(db, current_user.id)
    return _build_response(db, current_user.id)


@router.put("", response_model=AiSettingsResponse)
def update_ai_settings(
    data: AiSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update AI prompts and/or OpenAI API key."""
    user_id = current_user.id
    ensure_user_ai_prompts(db, user_id)

    if data.clear_openai_api_key:
        clear_user_secret(db, user_id, PROVIDER_OPENAI)

    if data.openai_api_key is not None:
        key = _validate_openai_api_key(data.openai_api_key)
        try:
            set_user_secret(db, user_id, PROVIDER_OPENAI, key)
        except ValueError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    if data.prompts:
        for key in data.prompts:
            if key not in PROMPT_KEYS:
                raise HTTPException(
                    status_code=400, detail=f"Unknown prompt key: {key}"
                )
        for key, value in data.prompts.items():
            row = (
                db.query(AiPrompt)
                .filter(AiPrompt.user_id == user_id, AiPrompt.key == key)
                .first()
            )
            if row:
                row.value = value or ""
            else:
                db.add(AiPrompt(user_id=user_id, key=key, value=value or ""))
        db.commit()

    return _build_response(db, user_id)
