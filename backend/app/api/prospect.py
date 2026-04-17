"""Prospect a job: tailor CV and cover letter using AI; answer interview-style questions."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.config import settings
from app.db import get_db
from app.models import AiPrompt, CoverLetterVersion, CVVersion, ProspectQuestion, User
from app.services import storage
from app.services.text_extract import extract_text

router = APIRouter(prefix="/api/prospect", tags=["prospect"])

DEFAULT_TAILOR_CV = (
    "You are a professional career advisor. "
    "You are requested to tailor the candidate's CV to the job and company. "
    "Keep the same facts and experience; rephrase and reorder for relevance. "
    "Do not exaggerate, do not add skills they do not have, or change dates or job titles."
    "Output only the tailored CV text (no preamble)."
)
DEFAULT_TAILOR_COVER_LETTER = (
    "You are a professional career advisor. Tailor the candidate's cover letter to the job and company. "
    "Keep the same experience and tone; adjust wording and emphasis for relevance. Do not exaggerate. "
    "Output only the tailored cover letter text (no preamble)."
)
DEFAULT_PROSPECT_ANSWER = (
    "You are helping a job candidate prepare answers for applications and interviews. "
    "Write in British English. Use a simple, natural tone — conversational and genuine, not formal or stiff. "
    "Base your answer on the context provided (CV, cover letter, job spec). "
    "Infer the company name from the job spec if you can do so confidently. "
    "If you cannot confidently infer the company name, use a clear placeholder such as [[COMPANY_NAME]] so the user can replace it. "
    "Do not exaggerate. Output only the answer text, no preamble or labels."
)


def _get_prompt(db: Session, key: str, default: str) -> str:
    row = db.query(AiPrompt).filter(AiPrompt.key == key).first()
    return (row.value or "").strip() or default


class TailorRequest(BaseModel):
    company: str
    job_spec: str
    cv_id: Optional[int] = None
    cover_letter_id: Optional[int] = None


class TailorResponse(BaseModel):
    tailored_cv: Optional[str] = None
    tailored_cover_letter: Optional[str] = None
    error: Optional[str] = None


class QuestionOut(BaseModel):
    id: int
    question_text: str
    sort_order: int


class AnswerRequest(BaseModel):
    question_id: int
    company: str
    job_spec: str
    cv_id: Optional[int] = None
    cover_letter_id: Optional[int] = None


class AnswerResponse(BaseModel):
    answer: str


def _call_openai(system_prompt: str, user_content: str) -> str:
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="OpenAI API key is not configured. Set OPENAI_API_KEY in .env to use AI tailoring.",
        )
    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)
    response = client.chat.completions.create(
        model=settings.openai_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        max_tokens=4000,
    )
    return (response.choices[0].message.content or "").strip()


def do_tailor(
    db: Session,
    current_user: User,
    company: str,
    job_spec: str,
    cv_id: Optional[int] = None,
    cover_letter_id: Optional[int] = None,
    cv_text: Optional[str] = None,
) -> TailorResponse:
    """Shared tailor logic: AI-tailor CV and/or cover letter to job spec. Use cv_text (from cv_experiences) or cv_id (from file)."""
    job_spec = (job_spec or "").strip()
    if not job_spec:
        raise HTTPException(status_code=400, detail="Job spec is required.")

    if cv_text is None and cv_id:
        cv = (
            db.query(CVVersion)
            .filter(CVVersion.id == cv_id, CVVersion.user_id == current_user.id)
            .first()
        )
        if not cv:
            raise HTTPException(status_code=404, detail="CV not found.")
        content = storage.read_file(cv.file_path)
        cv_text = extract_text(content, cv.file_type) or "(No text extracted from CV.)"

    cl_text: Optional[str] = None
    if cover_letter_id:
        cl = (
            db.query(CoverLetterVersion)
            .filter(
                CoverLetterVersion.id == cover_letter_id,
                CoverLetterVersion.user_id == current_user.id,
            )
            .first()
        )
        if not cl:
            raise HTTPException(status_code=404, detail="Cover letter not found.")
        content = storage.read_file(cl.file_path)
        cl_text = (
            extract_text(content, cl.file_type)
            or "(No text extracted from cover letter.)"
        )

    if not (cv_text or "").strip() and not cl_text:
        raise HTTPException(
            status_code=400,
            detail="Provide at least one of cv_id, cv_text (from cv_experiences), or cover_letter_id to tailor.",
        )

    tailored_cv: Optional[str] = None
    tailored_cover_letter: Optional[str] = None

    if cv_text:
        system_prompt = _get_prompt(db, "tailor_cv", DEFAULT_TAILOR_CV)
        user_content = f"Job spec:\n{job_spec}\n\nCurrent CV:\n{cv_text}"
        tailored_cv = _call_openai(system_prompt, user_content)

    if cl_text:
        system_prompt = _get_prompt(
            db, "tailor_cover_letter", DEFAULT_TAILOR_COVER_LETTER
        )
        user_content = f"Job spec:\n{job_spec}\n\nCurrent cover letter:\n{cl_text}"
        tailored_cover_letter = _call_openai(system_prompt, user_content)

    return TailorResponse(
        tailored_cv=tailored_cv, tailored_cover_letter=tailored_cover_letter
    )


@router.post("/tailor", response_model=TailorResponse)
def tailor_cv_and_cover_letter(
    data: TailorRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Use AI to tailor the user's CV and/or cover letter to the job spec. Uses prompts from AI settings."""
    company = (data.company or "").strip()
    return do_tailor(
        db, current_user, company, data.job_spec, data.cv_id, data.cover_letter_id
    )


@router.get("/questions", response_model=List[QuestionOut])
def list_prospect_questions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List prospect questions (editable in DB). Ordered by sort_order."""
    questions = (
        db.query(ProspectQuestion)
        .order_by(ProspectQuestion.sort_order, ProspectQuestion.id)
        .all()
    )
    return [
        QuestionOut(id=q.id, question_text=q.question_text, sort_order=q.sort_order)
        for q in questions
    ]


@router.post("/answer", response_model=AnswerResponse)
def generate_prospect_answer(
    data: AnswerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate an AI answer for a prospect question using British English, simple and natural tone."""
    question = (
        db.query(ProspectQuestion)
        .filter(ProspectQuestion.id == data.question_id)
        .first()
    )
    if not question:
        raise HTTPException(status_code=404, detail="Question not found.")

    job_spec = (data.job_spec or "").strip()
    if not job_spec:
        raise HTTPException(status_code=400, detail="Job spec is required.")

    cv_text: Optional[str] = None
    if data.cv_id:
        cv = (
            db.query(CVVersion)
            .filter(CVVersion.id == data.cv_id, CVVersion.user_id == current_user.id)
            .first()
        )
        if cv:
            content = storage.read_file(cv.file_path)
            cv_text = extract_text(content, cv.file_type) or ""
    cl_text: Optional[str] = None
    if data.cover_letter_id:
        cl = (
            db.query(CoverLetterVersion)
            .filter(
                CoverLetterVersion.id == data.cover_letter_id,
                CoverLetterVersion.user_id == current_user.id,
            )
            .first()
        )
        if cl:
            content = storage.read_file(cl.file_path)
            cl_text = extract_text(content, cl.file_type) or ""

    system_prompt = _get_prompt(db, "prospect_answer", DEFAULT_PROSPECT_ANSWER)
    context_parts = [f"Job spec:\n{job_spec}"]
    if cv_text:
        context_parts.append(f"Candidate's CV:\n{cv_text}")
    if cl_text:
        context_parts.append(f"Candidate's cover letter:\n{cl_text}")
    user_content = f"{question.question_text}\n\nContext:\n" + "\n\n---\n\n".join(
        context_parts
    )

    answer = _call_openai(system_prompt, user_content)
    return AnswerResponse(answer=answer)
