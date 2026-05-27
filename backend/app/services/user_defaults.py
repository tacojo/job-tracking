"""Per-user default AI prompts and prospect questions."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.ai_prompt import AiPrompt
from app.models.prospect_question import ProspectQuestion

DEFAULT_AI_PROMPTS: dict[str, str] = {
    "tailor_cv": (
        "You are a professional career adviser. Use British English spelling and terminology. "
        "You are requested to tailor the candidate's CV to the job and company. "
        "Keep the same facts and experience; rephrase and reorder for relevance. "
        "Do not exaggerate, do not add skills they do not have, or change dates or job titles. "
        "Output only the tailored CV text (no preamble)."
    ),
    "tailor_cover_letter": (
        "You are a professional career adviser. Use British English spelling and terminology. "
        "Tailor the candidate's cover letter to the job and company. "
        "Keep the same experience and tone; adjust wording and emphasis for relevance. Do not exaggerate. "
        "Output only the tailored cover letter text (no preamble)."
    ),
    "prospect_answer": (
        "You are helping a job candidate prepare answers for applications and interviews. "
        "Write in British English. Use a simple, natural tone — conversational and genuine, not formal or stiff. "
        "Base your answer on the context provided (CV, cover letter, company, job spec). "
        "Do not exaggerate. Output only the answer text, no preamble or labels."
    ),
    "learning_ask": (
        "You are a patient technical tutor helping someone prepare for interviews and on-the-job depth. "
        "Use British English. Be concrete; use short paragraphs. "
        "If asked something shallow, still add one practical angle or failure mode. "
        "Output plain text only — no markdown headings, no preamble."
    ),
    "learning_generate_flashcards": (
        "You create interview-practice flashcards in British English. "
        'Reply with one JSON object only, with key "flashcards" (array). '
        "Each element must have fields like question, answer, learning_goal, expected_depth, common_mistake, "
        'example, related_to, plus "notion_level" as exactly one of: elementary, intermediate, expert '
        "(demanding-ness of the main idea—foundational vs typical practitioner depth vs niche or harsh trade-offs)."
    ),
    "learning_refresh_flashcard": (
        "You improve one existing interview-prep flashcard. Use British English. "
        'Reply with one JSON object only. Keys include: "question", "answer", optional rich strings '
        '"learning_goal", "expected_depth", "common_mistake", "example", "related_to", and '
        '"notion_level" (elementary | intermediate | expert) for how hard the main idea is. '
        "Deepen thin answers; keep overall topic unless the card was wrong."
    ),
    "learning_refresh_note": (
        "You improve one existing study note. Use British English, Markdown in body where useful. "
        'Reply with one JSON object only with keys: "title" (string), "body_markdown" (string). '
        "Clarify structure; preserve factual intent."
    ),
    "learning_extract_concepts": (
        "You analyse interview-prep learning cards. Use British English in free-text fields. "
        "Extract typed concepts, propose concept-to-concept edges (by id or name), suggest broad_tags "
        "for library filtering, and optional graph links. Output one JSON object only."
    ),
}

DEFAULT_PROSPECT_QUESTIONS: list[tuple[int, str]] = [
    (0, "Brief introduction of yourself"),
    (1, "Brief introduction of the current role"),
    (2, "Summary of relevant experience aligned to the role requirements"),
    (3, "Relevant industry or domain experience"),
    (4, "Motivation for the move / why interested in this role"),
]


def ensure_user_ai_prompts(db: Session, user_id: int) -> None:
    """Insert missing default AI prompts for a user."""
    existing_keys = {
        row[0]
        for row in db.query(AiPrompt.key).filter(AiPrompt.user_id == user_id).all()
    }
    added = False
    for key, value in DEFAULT_AI_PROMPTS.items():
        if key not in existing_keys:
            db.add(AiPrompt(user_id=user_id, key=key, value=value))
            added = True
    if added:
        db.commit()


def ensure_user_prospect_questions(db: Session, user_id: int) -> None:
    """Insert default prospect questions when the user has none."""
    if (
        db.query(ProspectQuestion.id)
        .filter(ProspectQuestion.user_id == user_id)
        .first()
        is not None
    ):
        return
    for sort_order, question_text in DEFAULT_PROSPECT_QUESTIONS:
        db.add(
            ProspectQuestion(
                user_id=user_id,
                question_text=question_text,
                sort_order=sort_order,
            )
        )
    db.commit()


def ensure_user_defaults(db: Session, user_id: int) -> None:
    """Ensure default AI prompts and prospect questions exist for a user."""
    ensure_user_ai_prompts(db, user_id)
    ensure_user_prospect_questions(db, user_id)


def get_ai_prompt(db: Session, user_id: int, key: str, default: str) -> str:
    """Return the user's prompt for key, seeding defaults if needed."""
    row = (
        db.query(AiPrompt)
        .filter(AiPrompt.user_id == user_id, AiPrompt.key == key)
        .first()
    )
    if row is None:
        if key in DEFAULT_AI_PROMPTS:
            db.add(AiPrompt(user_id=user_id, key=key, value=DEFAULT_AI_PROMPTS[key]))
            db.commit()
            return DEFAULT_AI_PROMPTS[key].strip()
        return default
    return (row.value or "").strip() or default
