"""AI settings: model (read-only) and editable prompts for prospect/tailor."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.config import settings
from app.db import get_db
from app.models import AiPrompt, User

router = APIRouter(prefix="/api/settings/ai", tags=["ai-settings"])

PROMPT_KEYS = ("tailor_cv", "tailor_cover_letter", "prospect_answer")


class AiSettingsResponse(BaseModel):
    model: str
    prompts: dict[str, str]


class AiSettingsUpdate(BaseModel):
    prompts: dict[str, str]


def _prompts_from_db(db: Session) -> dict[str, str]:
    rows = db.query(AiPrompt).filter(AiPrompt.key.in_(PROMPT_KEYS)).all()
    return {r.key: r.value for r in rows}


@router.get("", response_model=AiSettingsResponse)
def get_ai_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return AI model (read-only) and current prompts for editing."""
    prompts = _prompts_from_db(db)
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
    if not data.prompts:
        return AiSettingsResponse(
            model=settings.openai_model, prompts=_prompts_from_db(db)
        )
    for key in data.prompts:
        if key not in PROMPT_KEYS:
            raise HTTPException(status_code=400, detail=f"Unknown prompt key: {key}")
    for key, value in data.prompts.items():
        row = db.query(AiPrompt).filter(AiPrompt.key == key).first()
        if row:
            row.value = value or ""
        else:
            db.add(AiPrompt(key=key, value=value or ""))
    db.commit()
    prompts = _prompts_from_db(db)
    for key in PROMPT_KEYS:
        if key not in prompts:
            prompts[key] = ""
    return AiSettingsResponse(model=settings.openai_model, prompts=prompts)
