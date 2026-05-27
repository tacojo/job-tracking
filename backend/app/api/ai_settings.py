"""AI settings: model (read-only) and editable prompts for prospect/tailor."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.config import settings
from app.db import get_db
from app.models import AiPrompt, User
from app.services.user_defaults import ensure_user_ai_prompts

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


class AiSettingsUpdate(BaseModel):
    prompts: dict[str, str]


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


@router.get("", response_model=AiSettingsResponse)
def get_ai_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return AI model (read-only) and current prompts for editing."""
    ensure_user_ai_prompts(db, current_user.id)
    prompts = _prompts_from_db(db, current_user.id)
    for key in PROMPT_KEYS:
        if key not in prompts:
            prompts[key] = ""
    return AiSettingsResponse(model=settings.openai_model, prompts=prompts)


@router.put("", response_model=AiSettingsResponse)
def update_ai_settings(
    data: AiSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update AI prompts. Only provided keys are updated."""
    user_id = current_user.id
    if not data.prompts:
        ensure_user_ai_prompts(db, user_id)
        return AiSettingsResponse(
            model=settings.openai_model, prompts=_prompts_from_db(db, user_id)
        )
    for key in data.prompts:
        if key not in PROMPT_KEYS:
            raise HTTPException(status_code=400, detail=f"Unknown prompt key: {key}")
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
    prompts = _prompts_from_db(db, user_id)
    for key in PROMPT_KEYS:
        if key not in prompts:
            prompts[key] = ""
    return AiSettingsResponse(model=settings.openai_model, prompts=prompts)
