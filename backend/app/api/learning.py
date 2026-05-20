"""Learning Centre API: items, tags, concept graph (nodes + edges), AI helpers."""

from __future__ import annotations

import json
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.config import settings
from app.db import get_db
from app.models import (
    AiPrompt,
    ConceptRelationship,
    LearningConcept,
    LearningItem,
    LearningItemConcept,
    LearningItemReview,
    LearningItemTag,
    LearningTag,
    User,
)
from app.schemas.learning import (
    CONCEPT_IMPORTANCE,
    CONCEPT_TYPES,
    LINK_RELATIONSHIP_TYPES,
    NOTION_LEVEL,
    ConceptExploreEdgeIn,
    ConceptExploreEdgeOut,
    ConceptExploreItemRow,
    ConceptExploreResponse,
    ConceptRelationshipCreateBody,
    ConceptRelationshipCreateResponse,
    FlashcardContentValidator,
    GraphEdge,
    GraphNode,
    LearningAIRefreshRequest,
    LearningAIRefreshResponse,
    LearningAskRequest,
    LearningAskResponse,
    LearningBatchCreateRequest,
    LearningBatchCreateResponse,
    LearningConceptBareRead,
    LearningConceptCreateBody,
    LearningConceptRead,
    LearningExtractConceptsRequest,
    LearningExtractConceptsResponse,
    LearningGenerateFlashcardsRequest,
    LearningGraphResponse,
    LearningItemCreateBody,
    LearningItemPatch,
    LearningItemRead,
    LearningRelationshipRead,
    LearningSearchMatch,
    LearningSearchRequest,
    LearningSearchResponse,
    NoteContentValidator,
    ReviewRecordRequest,
    TagRead,
)

router = APIRouter(prefix="/api/learning", tags=["learning"])

_ITEM_LOAD = (
    joinedload(LearningItem.tags),
    joinedload(LearningItem.concept_attachments).joinedload(
        LearningItemConcept.concept
    ),
)

DEFAULT_LEARNING_ASK = (
    "You are a patient technical tutor helping someone prepare for interviews and on-the-job depth. "
    "Use British English. Be concrete; use short paragraphs. "
    "If asked something shallow, still add one practical angle or failure mode. "
    "Output plain text only — no markdown headings, no preamble."
)

DEFAULT_LEARNING_REFRESH_FLASHCARD = (
    "You improve one existing interview-prep flashcard. Use British English. "
    'Reply with one JSON object only. Keys: "question" (string), "answer" (string), '
    '"learning_goal", "expected_depth", "common_mistake", "example", "related_to" (strings, optional but prefer rich). '
    'Also include "notion_level" (exactly one of: elementary, intermediate, expert): how difficult '
    "the main idea on this card is for a competent practitioner "
    "(elementary=foundation/basic recall, intermediate=solid practitioner depth, "
    "expert=niche, optimisation, harsh trade-offs or rare failure modes)."
    " Deepen thin answers; add scenario, failure mode, or scope. Keep the same overall topic unless the card was wrong."
)

DEFAULT_LEARNING_REFRESH_NOTE = (
    "You improve one existing study note. Use British English, Markdown in body where useful. "
    'Reply with one JSON object only with keys: "title" (string), "body_markdown" (string). '
    "Clarify structure; preserve factual intent."
)

DEFAULT_LEARNING_GENERATE = (
    "You create interview-practice flashcards in British English. "
    'Reply with one JSON object only, with key "flashcards" (array). '
    "Each element must have: "
    '"question" (string, specific and situated — not generic trivia), '
    '"answer" (string, includes scenario, trade-off, blast radius, or practical scope where relevant), '
    '"learning_goal" (string), '
    '"expected_depth" (string), '
    '"common_mistake" (string), '
    '"example" (string, concrete), '
    '"related_to" (string, topic anchor; comma-separated concrete topics help tagging e.g. "CI/CD, GitHub Actions"), '
    '"notion_level" (exactly one of: elementary, intermediate, expert). '
    "When the user's message specifies a target batch level, every card MUST use that same notion_level and match difficulty; "
    "otherwise spread levels across the batch when fitting. "
    "In each answer string use newline characters (\\n in JSON) between sentences or distinct short phrases/clauses "
    "so the answer scans easily when revealed — avoid one dense paragraph. "
    "Avoid answers that are only 'X means Y' with no application when the topic is practical."
)

DEFAULT_LEARNING_EXTRACT_CONCEPTS = (
    "You analyse one interview-prep flashcard or study note for a personal knowledge graph. "
    "Use British English for reasons and echoed fields. "
    "Extract atomic concepts a learner could master independently: "
    "assign each a type from concept_types and an importance from importance_levels. "
    "Propose directed edges between ideas: each relationship must use source_concept_name "
    "(exact match to one name in your concepts array for this card) and either "
    "target_concept_id from existing_concepts_catalog OR target_concept_name matching a "
    "catalog name (or another concept you just listed in concepts[] for this card). "
    "Relationship strings must belong to relationship_types (hyphens in output are acceptable). "
    "Also add broad_tags: an array of 3–8 short library filter labels (e.g. ci-cd, security, docker) — "
    "broad topics for search, NOT the same as long concept names. "
    "Reply with ONE JSON object only. Keys: "
    "question (string, echo flashcard title or empty for notes), answer (string), goal (string), "
    "common_mistake (string), "
    "concepts (array of {name, type, importance}), "
    "relationships (array of {source_concept_name, target_concept_id or target_concept_name, relationship, reason}), "
    "broad_tags (array of short strings). "
    "If no safe links exist, return an empty relationships array. "
    "Each reason should justify the relationship in one or two short sentences."
)

DEFAULT_LEARNING_SUGGEST_EDGES_ON_SAVE = (
    "You help a learner connect ideas on a flashcard or study note to their personal concept graph. "
    "Use British English in the reason strings. "
    "The user message lists concepts already attached to the card (concepts_on_card) and the full catalog "
    "(existing_concepts_catalog). Propose directed edges that are clearly justified by the card text. "
    "Reply with ONE JSON object only: {"
    '"relationships": ['
    "{source_concept_name, target_concept_id and/or target_concept_name, relationship, reason}"
    "]}. "
    "source_concept_name must exactly match one concepts_on_card[].name. "
    "relationship must correspond to relationship_types (hyphens in output are acceptable). "
    "reason must be at least 4 characters. "
    'If no meaningful links exist, return {"relationships": []}.'
)


def _coerce_notion_level_optional(raw: Any) -> str | None:
    if raw is None:
        return None
    s = str(raw).strip().lower().replace("-", "_").replace(" ", "_")
    while "__" in s:
        s = s.replace("__", "_")
    aliases = {
        "beginner": "elementary",
        "basic": "elementary",
        "foundational": "elementary",
        "foundation": "elementary",
        "mid": "intermediate",
        "medium": "intermediate",
        "advanced": "expert",
        "hard": "expert",
        "senior": "expert",
    }
    s = aliases.get(s, s)
    if s in NOTION_LEVEL:
        return s
    return None


def _resolve_notion_level(raw: Any) -> str:
    """Default intermediate when absent or unparsable."""
    c = _coerce_notion_level_optional(raw)
    return c if c is not None else "intermediate"


def _notion_level_on_item_row(item: LearningItem) -> str:
    nl = getattr(item, "notion_level", None)
    return nl if isinstance(nl, str) and nl in NOTION_LEVEL else "intermediate"


def _answer_readable_line_breaks(text: str | None) -> str:
    """Ensure flashcard answers from AI are broken into readable lines."""
    raw = str(text or "").strip()
    if not raw:
        return ""
    t = raw.replace("\r\n", "\n").replace("\r", "\n")
    if "\n" in t:
        lines = [ln.strip() for ln in t.split("\n")]
        lines = [ln for ln in lines if ln]
        return "\n".join(lines)
    condensed = " ".join(t.split())
    chunks = [
        re.sub(r"\s+", " ", p).strip()
        for p in re.split(r"(?<=[.!?])\s+", condensed)
        if p.strip()
    ]
    if len(chunks) > 1:
        return "\n".join(chunks)
    sub = [
        re.sub(r"\s+", " ", p).strip()
        for p in re.split(r"\s*;\s*", condensed)
        if p.strip()
    ]
    if len(sub) > 1:
        return "\n".join(sub)
    return condensed


def _get_prompt(db: Session, key: str, default: str) -> str:
    row = db.query(AiPrompt).filter(AiPrompt.key == key).first()
    if row is None:
        return default
    return (row.value or "").strip() or default


def _call_openai_text(system_prompt: str, user_content: str) -> str:
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="OpenAI API key is not configured. Set OPENAI_API_KEY in .env.",
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


def _call_openai_json(system_prompt: str, user_content: str) -> str:
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="OpenAI API key is not configured. Set OPENAI_API_KEY in .env.",
        )
    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)
    response = client.chat.completions.create(
        model=settings.openai_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_object"},
        max_tokens=4000,
    )
    return (response.choices[0].message.content or "").strip()


def _parse_content_dict(raw: str) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _normalize_ai_concepts(raw_list: Any) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    if not isinstance(raw_list, list):
        return out
    seen: set[str] = set()
    for el in raw_list[:24]:
        if not isinstance(el, dict):
            continue
        name = " ".join(str(el.get("name", "")).strip().split())
        if not name:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        ctype = (
            str(el.get("type", "principle"))
            .strip()
            .lower()
            .replace(" ", "_")
            .replace("-", "_")
        )
        if ctype not in CONCEPT_TYPES:
            ctype = "principle"
        imp = str(el.get("importance", "secondary")).strip().lower()
        if imp not in CONCEPT_IMPORTANCE:
            imp = "secondary"
        out.append({"name": name[:200], "type": ctype, "importance": imp})
    return out


def _coerce_int_id(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if value != int(value):
            return None
        return int(value)
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        try:
            return int(s)
        except ValueError:
            return None
    return None


def _target_concept_id_from_rel_dict(rel: dict[str, Any]) -> int | None:
    for key in (
        "target_concept_id",
        "target_id",
        "to_concept_id",
        "targetConceptId",
    ):
        tid = _coerce_int_id(rel.get(key))
        if tid is not None:
            return tid
    return None


def _source_concept_name_from_rel(rel: dict[str, Any]) -> str:
    for key in (
        "source_concept_name",
        "from_concept_name",
        "source_name",
        "from_name",
    ):
        v = rel.get(key)
        if v is not None and str(v).strip():
            return " ".join(str(v).strip().split())
    return ""


def _target_concept_name_from_rel(rel: dict[str, Any]) -> str:
    for key in ("target_concept_name", "target_name", "to_concept_name"):
        v = rel.get(key)
        if v is not None and str(v).strip():
            return " ".join(str(v).strip().split())
    return ""


def _relationship_raw_from_dict(rel: dict[str, Any]) -> str:
    for key in ("relationship", "relation", "relation_type", "link_type"):
        v = rel.get(key)
        if v is not None and str(v).strip():
            return str(v).strip()
    return ""


def _normalize_link_relationship_type(raw: str) -> str | None:
    s = str(raw or "").strip().lower().replace("-", "_")
    s = " ".join(s.split())
    s = s.replace(" ", "_")
    while "__" in s:
        s = s.replace("__", "_")
    if s in LINK_RELATIONSHIP_TYPES:
        return s
    return None


def _serialize_content(
    item_type: str, title: str, content: dict[str, Any]
) -> tuple[str, str]:
    if item_type == "flashcard":
        v = FlashcardContentValidator.model_validate(content)
        data = v.model_dump(exclude_none=True)
        parts = [title]
        for key in (
            "answer",
            "learning_goal",
            "expected_depth",
            "audience",
            "common_mistake",
            "example",
            "related_to",
        ):
            val = data.get(key)
            if val:
                parts.append(str(val))
        search_text = " ".join(parts)
        return json.dumps(data, ensure_ascii=False), search_text
    if item_type == "note":
        v = NoteContentValidator.model_validate(content)
        data = v.model_dump()
        body = data.get("body_markdown") or ""
        search_text = f"{title} {body}".strip()
        return json.dumps(data, ensure_ascii=False), search_text
    raise HTTPException(status_code=400, detail=f"Unsupported type: {item_type}")


def _optional_content_str(value: Any) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def _merge_flashcard_refresh(
    item: LearningItem,
    payload: dict[str, Any],
) -> tuple[str, dict[str, Any]]:
    cur = _parse_content_dict(item.content)

    def pick(key: str) -> str | None:
        v = _optional_content_str(payload.get(key))
        if v:
            return v
        v2 = cur.get(key)
        return _optional_content_str(v2) if v2 is not None else None

    title = (
        _optional_content_str(payload.get("question"))
        or _optional_content_str(payload.get("title"))
        or (item.title or "").strip()
    )
    answer = _optional_content_str(payload.get("answer")) or _optional_content_str(
        cur.get("answer")
    )
    if not title or not answer:
        raise HTTPException(
            status_code=502,
            detail="AI flashcard refresh must include a non-empty question and answer.",
        )
    content: dict[str, Any] = {"answer": answer}
    for key in (
        "learning_goal",
        "expected_depth",
        "common_mistake",
        "example",
        "related_to",
        "audience",
    ):
        val = pick(key)
        if val:
            content[key] = val
    return title[:512], content


def _merge_note_refresh(
    item: LearningItem,
    payload: dict[str, Any],
) -> tuple[str, dict[str, Any]]:
    cur = _parse_content_dict(item.content)
    title = _optional_content_str(payload.get("title")) or (item.title or "").strip()
    body = _optional_content_str(payload.get("body_markdown")) or _optional_content_str(
        cur.get("body_markdown")
    )
    if not body:
        raise HTTPException(
            status_code=502,
            detail="AI note refresh must include a non-empty body_markdown.",
        )
    return title[:512], {"body_markdown": body}


def _effective_tag_names_for_create(
    body: LearningItemCreateBody,
) -> list[str]:
    explicit = [
        " ".join((x or "").strip().split())
        for x in body.tag_names
        if x and str(x).strip()
    ]
    deduped: list[str] = []
    s2: set[str] = set()
    for t in explicit:
        k = t.lower()
        if k not in s2:
            s2.add(k)
            deduped.append(t)
    if deduped:
        return deduped
    return []


def _concept_attachments_to_read(item: LearningItem) -> list[LearningConceptRead]:
    out: list[LearningConceptRead] = []
    for att in getattr(item, "concept_attachments", None) or []:
        c = att.concept
        if not c:
            continue
        out.append(
            LearningConceptRead(
                id=c.id,
                name=c.name,
                type=(att.concept_type or ""),
                importance=(att.importance or ""),
            )
        )
    out.sort(key=lambda x: x.name.lower())
    return out


def _item_to_read(item: LearningItem) -> LearningItemRead:
    tags = [TagRead.model_validate(t) for t in item.tags]
    concepts = _concept_attachments_to_read(item)
    return LearningItemRead(
        id=item.id,
        type=item.type,
        title=item.title,
        content=_parse_content_dict(item.content),
        search_text=item.search_text,
        status=item.status,
        source=item.source,
        source_topic=item.source_topic,
        notion_level=_notion_level_on_item_row(item),
        tags=tags,
        concepts=concepts,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _get_item_owned(
    db: Session, user_id: int, item_id: int, *, load_graph: bool = True
) -> LearningItem:
    q = db.query(LearningItem).filter(
        LearningItem.id == item_id,
        LearningItem.user_id == user_id,
    )
    if load_graph:
        q = q.options(*_ITEM_LOAD)
    item = q.first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    return item


def _reload_items_ordered(db: Session, ids: list[int]) -> list[LearningItem]:
    if not ids:
        return []
    rows = (
        db.query(LearningItem)
        .options(*_ITEM_LOAD)
        .filter(LearningItem.id.in_(ids))
        .all()
    )
    by_id = {r.id: r for r in rows}
    return [by_id[i] for i in ids if i in by_id]


def _tag_default_status_for_item(item_status: str) -> str:
    return "approved" if item_status == "approved" else "draft"


def _sync_item_tags(
    db: Session,
    user_id: int,
    item: LearningItem,
    names: list[str],
    *,
    tag_source: str,
) -> None:
    seen: list[str] = []
    for raw in names:
        s = " ".join((raw or "").strip().split())
        if s and s not in seen:
            seen.append(s)

    db.query(LearningItemTag).filter(
        LearningItemTag.learning_item_id == item.id
    ).delete(synchronize_session=False)

    want_status = _tag_default_status_for_item(item.status)
    for name in seen:
        tag = (
            db.query(LearningTag)
            .filter(LearningTag.user_id == user_id, LearningTag.name == name)
            .first()
        )
        if not tag:
            tag = LearningTag(
                user_id=user_id,
                name=name,
                status=want_status,
                source=tag_source,
            )
            db.add(tag)
            db.flush()
        else:
            if tag.status == "draft" and want_status == "approved":
                tag.status = "approved"
        db.add(LearningItemTag(learning_item_id=item.id, tag_id=tag.id))


def _normalize_broad_tags_list(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for el in raw[:10]:
        if isinstance(el, str):
            s = " ".join(el.strip().split())
            if s:
                out.append(s[:80])
    return out


def _broad_tags_from_payload(payload: dict[str, Any]) -> list[str]:
    direct = _normalize_broad_tags_list(payload.get("broad_tags"))
    if direct:
        return direct
    return _normalize_broad_tags_list(payload.get("suggested_filter_tags"))


def _merge_item_tags_with_ai_suggestions(
    item: LearningItem, suggestions: list[str]
) -> list[str]:
    """Keep existing tags first, append new suggestions; dedupe case-insensitively."""
    out: list[str] = []
    seen: set[str] = set()
    for raw in [t.name for t in (item.tags or [])] + suggestions:
        s = " ".join((raw or "").strip().split())
        if not s:
            continue
        k = s.lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(s)
        if len(out) >= 16:
            break
    return out


def _ensure_concepts_owned(db: Session, user_id: int, concept_ids: list[int]) -> None:
    uniq = list(dict.fromkeys(concept_ids))
    if not uniq:
        return
    n = (
        db.query(LearningConcept)
        .filter(
            LearningConcept.user_id == user_id,
            LearningConcept.id.in_(uniq),
        )
        .count()
    )
    if n != len(uniq):
        raise HTTPException(
            status_code=400, detail="One or more concept_ids are unknown."
        )


def _sync_item_concept_ids(
    db: Session,
    user_id: int,
    item: LearningItem,
    concept_ids: list[int],
) -> None:
    db.query(LearningItemConcept).filter(
        LearningItemConcept.learning_item_id == item.id
    ).delete(synchronize_session=False)
    seen: set[int] = set()
    for cid in concept_ids:
        if cid in seen:
            continue
        seen.add(cid)
        lc = (
            db.query(LearningConcept)
            .filter(
                LearningConcept.id == cid,
                LearningConcept.user_id == user_id,
            )
            .first()
        )
        if lc:
            db.add(LearningItemConcept(learning_item_id=item.id, concept_id=cid))


def _concept_by_name_ci(
    db: Session, user_id: int, canonical_lower: str
) -> LearningConcept | None:
    if not canonical_lower:
        return None
    return (
        db.query(LearningConcept)
        .filter(
            LearningConcept.user_id == user_id,
            func.lower(LearningConcept.name) == canonical_lower,
        )
        .first()
    )


def _all_concept_ids_for_user(db: Session, user_id: int) -> set[int]:
    return {
        r[0]
        for r in db.query(LearningConcept.id)
        .filter(LearningConcept.user_id == user_id)
        .all()
    }


def _concept_id_to_name_map(db: Session, user_id: int) -> dict[int, str]:
    return {
        row.id: row.name
        for row in db.query(LearningConcept)
        .filter(LearningConcept.user_id == user_id)
        .all()
    }


def _resolve_rel_target_ids_in_place(
    db: Session, user_id: int, rels: list[dict[str, Any]]
) -> None:
    """Fill target_concept_id when the model only supplied a target name."""
    for rel in rels:
        if _target_concept_id_from_rel_dict(rel) is not None:
            continue
        tn = _target_concept_name_from_rel(rel)
        if not tn:
            continue
        row = _concept_by_name_ci(db, user_id, tn.strip().lower())
        if row is not None:
            rel["target_concept_id"] = row.id


def _get_or_create_extract_concept_row(
    db: Session,
    user_id: int,
    *,
    display_name: str,
    ctype: str,
    importance: str,
    concept_source: str,
    item_status: str,
) -> LearningConcept:
    key = display_name.strip().lower()
    row = _concept_by_name_ci(db, user_id, key)
    want_status = _tag_default_status_for_item(item_status)
    if row:
        if row.status == "draft" and want_status == "approved":
            row.status = "approved"
        return row
    row = LearningConcept(
        user_id=user_id,
        name=display_name.strip()[:255],
        status=want_status,
        source=concept_source,
    )
    db.add(row)
    db.flush()
    return row


def _replace_extracted_concepts_attachment(
    db: Session,
    user_id: int,
    item: LearningItem,
    concepts_raw: list[dict[str, str]],
    *,
    concept_source: str,
) -> dict[str, int]:
    """Clear item concept links; upsert concepts; return lower(name)->concept_id for edge wiring."""
    db.query(LearningItemConcept).filter(
        LearningItemConcept.learning_item_id == item.id
    ).delete(synchronize_session=False)
    name_to_id: dict[str, int] = {}
    for c in concepts_raw:
        display = c["name"]
        row = _get_or_create_extract_concept_row(
            db,
            user_id,
            display_name=display,
            ctype=c["type"],
            importance=c["importance"],
            concept_source=concept_source,
            item_status=item.status,
        )
        db.add(
            LearningItemConcept(
                learning_item_id=item.id,
                concept_id=row.id,
                concept_type=c["type"],
                importance=c["importance"],
            )
        )
        name_to_id[display.strip().lower()] = row.id
    return name_to_id


def _parse_relationship_rows(
    raw_rels: Any,
) -> list[dict[str, Any]]:
    if not isinstance(raw_rels, list) or not raw_rels:
        return []
    return [rel for rel in raw_rels if isinstance(rel, dict)]


def _relationship_reads_from_ai(
    raw_rels: list[dict[str, Any]],
    *,
    allowed_target_ids: set[int],
    id_to_title: dict[int, str],
    names_to_source_ids: dict[str, int] | None,
    resolve_source_ids: bool = True,
) -> list[LearningRelationshipRead]:
    out: list[LearningRelationshipRead] = []
    for rel in raw_rels:
        tid = _target_concept_id_from_rel_dict(rel)
        if tid is not None and tid not in allowed_target_ids:
            continue
        src_name_key = _source_concept_name_from_rel(rel).strip().lower()
        src_id = None
        if resolve_source_ids and names_to_source_ids is not None:
            if src_name_key:
                src_id = names_to_source_ids.get(src_name_key)
            if src_id is None and len(names_to_source_ids) == 1:
                src_id = next(iter(names_to_source_ids.values()))
        rtype = _normalize_link_relationship_type(_relationship_raw_from_dict(rel))
        if rtype is None:
            continue
        reason = str(rel.get("reason", "") or rel.get("rationale", "") or "").strip()
        if len(reason) < 4:
            continue
        raw_src = (_source_concept_name_from_rel(rel) or "").strip()
        raw_tgt_nm = (_target_concept_name_from_rel(rel) or "").strip()

        out.append(
            LearningRelationshipRead(
                source_concept_id=src_id,
                source_concept_name=(raw_src or None),
                target_concept_id=tid,
                target_concept_name=(id_to_title.get(tid) if tid else None)
                or (raw_tgt_nm or None),
                relationship=rtype,
                reason=reason[:2000],
            )
        )
    return out


def _persist_concept_edges(
    db: Session,
    user_id: int,
    raw_rels: list[dict[str, Any]],
    names_to_source_ids: dict[str, int],
    *,
    allowed_targets: set[int],
) -> int:
    created = 0
    fallback_src: int | None = None
    if len(names_to_source_ids) == 1:
        fallback_src = next(iter(names_to_source_ids.values()))

    for rel in raw_rels:
        tid = _target_concept_id_from_rel_dict(rel)
        if tid is None or tid not in allowed_targets:
            continue
        rtype = _normalize_link_relationship_type(_relationship_raw_from_dict(rel))
        if rtype is None:
            continue
        reason = str(rel.get("reason", "") or rel.get("rationale", "") or "").strip()
        if len(reason) < 4:
            continue

        src_name_key = _source_concept_name_from_rel(rel).strip().lower()
        sid = names_to_source_ids.get(src_name_key) if src_name_key else fallback_src
        if sid is None:
            continue
        if sid == tid:
            continue

        owns = (
            db.query(LearningConcept)
            .filter(
                LearningConcept.id.in_((sid, tid)),
                LearningConcept.user_id == user_id,
            )
            .count()
            == 2
        )
        if not owns:
            continue

        dup = (
            db.query(ConceptRelationship)
            .filter(
                ConceptRelationship.user_id == user_id,
                ConceptRelationship.source_concept_id == sid,
                ConceptRelationship.target_concept_id == tid,
                ConceptRelationship.relation_type == rtype,
            )
            .first()
        )
        if dup:
            continue
        db.add(
            ConceptRelationship(
                user_id=user_id,
                source_concept_id=sid,
                target_concept_id=tid,
                relation_type=rtype,
                reason=reason[:2000],
            )
        )
        created += 1
    return created


def _run_ai_suggest_edges_for_item(db: Session, user_id: int, item_id: int) -> int:
    """LLM: suggest concept→concept edges from current card text + attachments; persist validated edges only."""
    try:
        item = _get_item_owned(db, user_id, item_id)
        pairs = (
            db.query(LearningConcept.id, LearningConcept.name)
            .join(
                LearningItemConcept,
                LearningItemConcept.concept_id == LearningConcept.id,
            )
            .filter(
                LearningItemConcept.learning_item_id == item.id,
                LearningConcept.user_id == user_id,
            )
            .order_by(LearningConcept.name.asc())
            .all()
        )
        name_to_real_id: dict[str, int] = {nm.strip().lower(): cid for cid, nm in pairs}
        concepts_on_card: list[dict[str, int | str]] = [
            {"id": cid, "name": nm} for cid, nm in pairs
        ]
        if not name_to_real_id:
            return 0

        content = _parse_content_dict(item.content)
        catalog_rows = (
            db.query(LearningConcept)
            .filter(LearningConcept.user_id == user_id)
            .order_by(LearningConcept.updated_at.desc())
            .limit(160)
            .all()
        )
        catalog_payload = [
            {"id": r.id, "name": r.name, "status": r.status} for r in catalog_rows
        ]

        if item.type == "flashcard":
            card_payload: dict[str, Any] = {
                "item_id": item.id,
                "type": "flashcard",
                "question": item.title,
                "answer": content.get("answer"),
                "goal": content.get("learning_goal"),
                "common_mistake": content.get("common_mistake"),
                "expected_depth": content.get("expected_depth"),
                "example": content.get("example"),
                "related_to": content.get("related_to"),
            }
        else:
            card_payload = {
                "item_id": item.id,
                "type": "note",
                "title": item.title,
                "body_markdown": content.get("body_markdown"),
            }

        user_obj = {
            "task": (
                "Propose directed graph edges from concepts on this card to related concepts in the catalog "
                "(or between two concepts on this card), using only the listed relationship types."
            ),
            "concepts_on_card": concepts_on_card,
            "source_card": card_payload,
            "existing_concepts_catalog": catalog_payload,
            "relationship_types": sorted(LINK_RELATIONSHIP_TYPES),
            "instruction": (
                'Reply with ONE JSON object: {"relationships": [...]}. '
                "Each element: source_concept_name (exact match to one concepts_on_card[].name), "
                "target_concept_id from the catalog and/or target_concept_name, "
                "relationship, reason (at least 4 characters). "
                "If no justified links exist, use an empty relationships array."
            ),
        }

        system = _get_prompt(
            db,
            "learning_suggest_edges_on_save",
            DEFAULT_LEARNING_SUGGEST_EDGES_ON_SAVE,
        )
        raw = _call_openai_json(system, json.dumps(user_obj, ensure_ascii=False))
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            return 0
        pending_rels = _parse_relationship_rows(payload.get("relationships"))
        if not pending_rels:
            pending_rels = _parse_relationship_rows(payload.get("links"))
        if not pending_rels:
            return 0

        _resolve_rel_target_ids_in_place(db, user_id, pending_rels)
        db.flush()
        _resolve_rel_target_ids_in_place(db, user_id, pending_rels)

        created = _persist_concept_edges(
            db,
            user_id,
            pending_rels,
            names_to_source_ids=name_to_real_id,
            allowed_targets=_all_concept_ids_for_user(db, user_id),
        )
        if created:
            db.commit()
        return created
    except HTTPException:
        return 0
    except Exception:
        return 0


def _create_one_item(
    db: Session,
    user_id: int,
    body: LearningItemCreateBody,
    *,
    default_source: str | None = None,
) -> LearningItem:
    item_type = body.type
    if item_type not in ("flashcard", "note"):
        raise HTTPException(status_code=400, detail="Invalid type.")

    status = body.status or "draft"
    if status not in ("draft", "approved", "archived"):
        raise HTTPException(status_code=400, detail="Invalid status.")

    source = body.source or default_source or "user_created"
    if source not in ("ai_generated", "user_created", "imported"):
        raise HTTPException(status_code=400, detail="Invalid source.")

    content_str, search_text = _serialize_content(item_type, body.title, body.content)
    item = LearningItem(
        user_id=user_id,
        type=item_type,
        title=body.title.strip(),
        content=content_str,
        search_text=search_text,
        status=status,
        source=source,
        source_topic=(body.source_topic or "").strip() or None,
        notion_level=_resolve_notion_level(body.notion_level),
    )
    db.add(item)
    db.flush()

    tag_names = _effective_tag_names_for_create(body)
    tag_src = "ai_generated" if source == "ai_generated" else "user_created"
    _sync_item_tags(db, user_id, item, tag_names, tag_source=tag_src)

    if getattr(body, "concept_ids", None):
        _ensure_concepts_owned(db, user_id, list(body.concept_ids))
        _sync_item_concept_ids(db, user_id, item, list(body.concept_ids))

    return (
        db.query(LearningItem)
        .options(*_ITEM_LOAD)
        .filter(LearningItem.id == item.id)
        .first()
        or item
    )


@router.post("/search", response_model=LearningSearchResponse)
def learning_search(
    data: LearningSearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = data.query.strip()
    tokens = [t.lower() for t in q.split() if t]
    if not tokens:
        return LearningSearchResponse(matches=[])

    items = (
        db.query(LearningItem)
        .options(*_ITEM_LOAD)
        .filter(
            LearningItem.user_id == current_user.id,
            LearningItem.status == "approved",
        )
        .all()
    )
    matches: list[LearningSearchMatch] = []
    for item in items:
        blob = (item.title + " " + (item.search_text or "")).lower()
        blob += " ".join(
            " " + t.name.lower() for t in item.tags if t.status == "approved"
        )
        for cread in _concept_attachments_to_read(item):
            blob += " " + cread.name.lower()
        st = (item.source_topic or "").strip()
        if st:
            blob += " " + st.lower()
        if all(tok in blob for tok in tokens):
            matches.append(
                LearningSearchMatch(
                    id=item.id,
                    type=item.type,
                    title=item.title,
                    notion_level=_notion_level_on_item_row(item),
                    tags=[TagRead.model_validate(t) for t in item.tags],
                )
            )
    return LearningSearchResponse(matches=matches)


@router.get("/concepts", response_model=list[LearningConceptBareRead])
def list_learning_concepts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(LearningConcept)
        .filter(LearningConcept.user_id == current_user.id)
        .order_by(LearningConcept.name.asc())
        .all()
    )
    return [LearningConceptBareRead.model_validate(r) for r in rows]


@router.get("/concepts/{concept_id}/explore", response_model=ConceptExploreResponse)
def get_concept_explore(
    concept_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    uid = current_user.id
    row = (
        db.query(LearningConcept)
        .filter(LearningConcept.id == concept_id, LearningConcept.user_id == uid)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Concept not found.")

    out_rows = (
        db.query(ConceptRelationship)
        .filter(
            ConceptRelationship.user_id == uid,
            ConceptRelationship.source_concept_id == concept_id,
        )
        .order_by(ConceptRelationship.id.asc())
        .all()
    )
    in_rows = (
        db.query(ConceptRelationship)
        .filter(
            ConceptRelationship.user_id == uid,
            ConceptRelationship.target_concept_id == concept_id,
        )
        .order_by(ConceptRelationship.id.asc())
        .all()
    )
    need_ids: set[int] = set()
    for e in out_rows:
        need_ids.add(e.target_concept_id)
    for e in in_rows:
        need_ids.add(e.source_concept_id)
    id_to_name: dict[int, str] = {}
    if need_ids:
        for c in (
            db.query(LearningConcept)
            .filter(
                LearningConcept.user_id == uid,
                LearningConcept.id.in_(need_ids),
            )
            .all()
        ):
            id_to_name[c.id] = c.name

    outgoing = [
        ConceptExploreEdgeOut(
            edge_id=e.id,
            target_concept_id=e.target_concept_id,
            target_name=id_to_name.get(int(e.target_concept_id), "(unknown)"),
            relation_type=e.relation_type,
            reason=e.reason,
        )
        for e in out_rows
    ]
    incoming = [
        ConceptExploreEdgeIn(
            edge_id=e.id,
            source_concept_id=e.source_concept_id,
            source_name=id_to_name.get(int(e.source_concept_id), "(unknown)"),
            relation_type=e.relation_type,
            reason=e.reason,
        )
        for e in in_rows
    ]

    items = (
        db.query(LearningItem)
        .join(
            LearningItemConcept, LearningItemConcept.learning_item_id == LearningItem.id
        )
        .filter(
            LearningItem.user_id == uid,
            LearningItemConcept.concept_id == concept_id,
        )
        .order_by(LearningItem.updated_at.desc())
        .all()
    )
    linked = [
        ConceptExploreItemRow(
            id=it.id,
            type=it.type,
            title=it.title,
            status=it.status,
            notion_level=_notion_level_on_item_row(it),
        )
        for it in items
    ]

    return ConceptExploreResponse(
        concept=LearningConceptBareRead.model_validate(row),
        outgoing_edges=outgoing,
        incoming_edges=incoming,
        linked_items=linked,
    )


@router.post("/concepts", response_model=LearningConceptBareRead)
def create_learning_concept(
    data: LearningConceptCreateBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    raw = " ".join(data.name.strip().split())
    if not raw:
        raise HTTPException(status_code=400, detail="Name required.")
    key = raw.lower()
    existing = _concept_by_name_ci(db, current_user.id, key)
    if existing:
        return LearningConceptBareRead.model_validate(existing)

    row = LearningConcept(
        user_id=current_user.id,
        name=raw[:255],
        status="draft",
        source="user_created",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return LearningConceptBareRead.model_validate(row)


@router.post(
    "/concept-relationships",
    response_model=ConceptRelationshipCreateResponse,
)
def create_concept_relationship(
    data: ConceptRelationshipCreateBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.source_concept_id == data.target_concept_id:
        raise HTTPException(status_code=400, detail="Self-edges are not allowed.")

    a = (
        db.query(LearningConcept)
        .filter(
            LearningConcept.id == data.source_concept_id,
            LearningConcept.user_id == current_user.id,
        )
        .first()
    )
    b = (
        db.query(LearningConcept)
        .filter(
            LearningConcept.id == data.target_concept_id,
            LearningConcept.user_id == current_user.id,
        )
        .first()
    )
    if not a or not b:
        raise HTTPException(status_code=404, detail="Concept not found.")

    rtype = data.relationship
    existing = (
        db.query(ConceptRelationship)
        .filter(
            ConceptRelationship.user_id == current_user.id,
            ConceptRelationship.source_concept_id == data.source_concept_id,
            ConceptRelationship.target_concept_id == data.target_concept_id,
            ConceptRelationship.relation_type == rtype,
        )
        .first()
    )
    if existing:
        return ConceptRelationshipCreateResponse(id=existing.id, created=False)

    rs = data.reason.strip() if data.reason else ""
    edge = ConceptRelationship(
        user_id=current_user.id,
        source_concept_id=data.source_concept_id,
        target_concept_id=data.target_concept_id,
        relation_type=rtype,
        reason=rs[:2000] if rs else None,
    )
    db.add(edge)
    db.commit()
    db.refresh(edge)
    return ConceptRelationshipCreateResponse(id=edge.id, created=True)


@router.get("/drafts", response_model=list[LearningItemRead])
def list_drafts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    type: str | None = Query(None),
    source: str | None = Query(None),
    notion_level: str | None = Query(None),
):
    q = (
        db.query(LearningItem)
        .options(*_ITEM_LOAD)
        .filter(
            LearningItem.user_id == current_user.id,
            LearningItem.status == "draft",
        )
    )
    if type:
        q = q.filter(LearningItem.type == type)
    if source:
        q = q.filter(LearningItem.source == source)
    if notion_level:
        nl = notion_level.strip().lower()
        if nl not in NOTION_LEVEL:
            raise HTTPException(
                status_code=400,
                detail="Invalid notion_level. Use elementary, intermediate, or expert.",
            )
        q = q.filter(LearningItem.notion_level == nl)
    items = q.order_by(LearningItem.updated_at.desc()).all()
    return [_item_to_read(i) for i in items]


@router.get("/items", response_model=list[LearningItemRead])
def list_items(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    status: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    notion_level: str | None = Query(None),
):
    q = (
        db.query(LearningItem)
        .options(*_ITEM_LOAD)
        .filter(LearningItem.user_id == current_user.id)
    )
    if status:
        q = q.filter(LearningItem.status == status)
    if notion_level:
        nl = notion_level.strip().lower()
        if nl not in NOTION_LEVEL:
            raise HTTPException(
                status_code=400,
                detail="Invalid notion_level. Use elementary, intermediate, or expert.",
            )
        q = q.filter(LearningItem.notion_level == nl)
    items = q.order_by(LearningItem.updated_at.desc()).limit(limit).all()
    return [_item_to_read(i) for i in items]


@router.get("/items/{item_id}", response_model=LearningItemRead)
def get_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = _get_item_owned(db, current_user.id, item_id)
    return _item_to_read(item)


@router.post("/items", response_model=LearningBatchCreateResponse)
def batch_create_items(
    data: LearningBatchCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ids: list[int] = []
    for body in data.items:
        item = _create_one_item(db, current_user.id, body)
        ids.append(item.id)
    db.commit()
    ordered = _reload_items_ordered(db, ids)
    return LearningBatchCreateResponse(items=[_item_to_read(i) for i in ordered])


@router.patch("/items/{item_id}", response_model=LearningItemRead)
def patch_item(
    item_id: int,
    data: LearningItemPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = _get_item_owned(db, current_user.id, item_id)
    if data.title is not None:
        item.title = data.title.strip()
    if data.source_topic is not None:
        item.source_topic = data.source_topic.strip() or None
    if data.notion_level is not None:
        item.notion_level = data.notion_level
    if data.status is not None:
        item.status = data.status
    if data.content is not None:
        title = item.title
        content_str, search_text = _serialize_content(item.type, title, data.content)
        item.content = content_str
        item.search_text = search_text
    if data.tag_names is not None:
        _sync_item_tags(
            db,
            current_user.id,
            item,
            data.tag_names,
            tag_source="user_created",
        )
    if data.concept_ids is not None:
        _ensure_concepts_owned(db, current_user.id, data.concept_ids)
        _sync_item_concept_ids(db, current_user.id, item, data.concept_ids)
    db.commit()
    want_edges = bool(data.extract_graph_edges)
    if want_edges:
        _run_ai_suggest_edges_for_item(db, current_user.id, item_id)
    fresh = _get_item_owned(db, current_user.id, item_id)
    return _item_to_read(fresh)


@router.delete("/items/{item_id}", status_code=204)
def delete_learning_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = _get_item_owned(db, current_user.id, item_id, load_graph=False)
    db.delete(item)
    db.commit()
    return Response(status_code=204)


@router.post("/items/{item_id}/ai-refresh", response_model=LearningAIRefreshResponse)
def ai_refresh_item(
    item_id: int,
    data: LearningAIRefreshRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = _get_item_owned(db, current_user.id, item_id)
    if item.type == "flashcard":
        system = _get_prompt(
            db,
            "learning_refresh_flashcard",
            DEFAULT_LEARNING_REFRESH_FLASHCARD,
        )
    elif item.type == "note":
        system = _get_prompt(
            db,
            "learning_refresh_note",
            DEFAULT_LEARNING_REFRESH_NOTE,
        )
    else:
        raise HTTPException(status_code=400, detail="Unsupported item type.")

    user_msg = (
        "Improve this card.\n\n"
        f"Title: {item.title}\n"
        f"Content JSON: {item.content}\n"
    )
    if item.type == "flashcard":
        user_msg += (
            f"\nCurrent notion_level: {_notion_level_on_item_row(item)} "
            "(elementary | intermediate | expert).\n"
        )
    if data.audience:
        user_msg += f"\nAudience / depth: {data.audience.strip()}\n"

    raw = _call_openai_json(system, user_msg)
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned invalid JSON.")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="AI JSON must be an object.")

    if item.type == "flashcard":
        proposal_title, proposal_content = _merge_flashcard_refresh(item, payload)
        proposal_nl = _coerce_notion_level_optional(payload.get("notion_level"))
    else:
        proposal_title, proposal_content = _merge_note_refresh(item, payload)
        proposal_nl = None

    if not data.apply:
        return LearningAIRefreshResponse(
            applied=False,
            item=None,
            proposal_title=proposal_title,
            proposal_content=proposal_content,
            proposal_notion_level=proposal_nl,
        )

    item.title = proposal_title
    content_str, search_text = _serialize_content(
        item.type, item.title, proposal_content
    )
    item.content = content_str
    item.search_text = search_text
    if item.type == "flashcard" and proposal_nl is not None:
        item.notion_level = proposal_nl
    db.commit()
    item = _get_item_owned(db, current_user.id, item_id)
    return LearningAIRefreshResponse(
        applied=True,
        item=_item_to_read(item),
        proposal_title=proposal_title,
        proposal_content=proposal_content,
        proposal_notion_level=proposal_nl,
    )


def _run_ai_extract_concepts(
    db: Session,
    user_id: int,
    item_id: int,
    data: LearningExtractConceptsRequest,
    *,
    do_commit: bool = True,
) -> LearningExtractConceptsResponse:
    item = _get_item_owned(db, user_id, item_id)
    content = _parse_content_dict(item.content)

    catalog_rows = (
        db.query(LearningConcept)
        .filter(LearningConcept.user_id == user_id)
        .order_by(LearningConcept.updated_at.desc())
        .limit(160)
        .all()
    )
    catalog_payload = [
        {"id": r.id, "name": r.name, "status": r.status} for r in catalog_rows
    ]

    if item.type == "flashcard":
        card_payload: dict[str, Any] = {
            "item_id": item.id,
            "type": "flashcard",
            "question": item.title,
            "answer": content.get("answer"),
            "goal": content.get("learning_goal"),
            "common_mistake": content.get("common_mistake"),
            "expected_depth": content.get("expected_depth"),
            "example": content.get("example"),
            "related_to": content.get("related_to"),
            "notion_level": _notion_level_on_item_row(item),
            "audience": content.get("audience"),
        }
    else:
        card_payload = {
            "item_id": item.id,
            "type": "note",
            "title": item.title,
            "body_markdown": content.get("body_markdown"),
            "notion_level": _notion_level_on_item_row(item),
        }

    user_obj = {
        "task": (
            "Extract concepts, suggest broad_tags for library search, and relate this card's concepts "
            "to others by id or by concept name."
        ),
        "source_card": card_payload,
        "existing_concepts_catalog": catalog_payload,
        "concept_types": sorted(CONCEPT_TYPES),
        "importance_levels": sorted(CONCEPT_IMPORTANCE),
        "relationship_types": sorted(LINK_RELATIONSHIP_TYPES),
        "instruction": (
            "relationships[].source_concept_name must match one concepts[].name. "
            "Each relationship must include target_concept_id (from catalog) and/or "
            "target_concept_name matching another concept (catalog or listed in concepts[]). "
            "Include broad_tags: short topics for filtering."
        ),
    }

    system = _get_prompt(
        db, "learning_extract_concepts", DEFAULT_LEARNING_EXTRACT_CONCEPTS
    )
    raw = _call_openai_json(system, json.dumps(user_obj, ensure_ascii=False))
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned invalid JSON.")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="AI JSON must be an object.")

    concepts_raw = _normalize_ai_concepts(payload.get("concepts"))
    pending_rels = _parse_relationship_rows(payload.get("relationships"))
    if not pending_rels:
        pending_rels = _parse_relationship_rows(payload.get("links"))

    _resolve_rel_target_ids_in_place(db, user_id, pending_rels)
    id_name_map = _concept_id_to_name_map(db, user_id)
    broad_preview = _broad_tags_from_payload(payload)

    concept_reads = [
        LearningConceptRead(
            name=c["name"],
            type=c["type"],
            importance=c["importance"],
        )
        for c in concepts_raw
    ]

    rel_reads = _relationship_reads_from_ai(
        pending_rels,
        allowed_target_ids=set(id_name_map.keys()),
        id_to_title=id_name_map,
        names_to_source_ids=None,
        resolve_source_ids=False,
    )

    card_summary: dict[str, Any] = {}
    for k in ("question", "answer", "goal", "common_mistake"):
        v = payload.get(k)
        if isinstance(v, str) and v.strip():
            card_summary[k] = v.strip()

    if not data.apply:
        return LearningExtractConceptsResponse(
            applied=False,
            item=None,
            concepts=concept_reads,
            relationships=[
                LearningRelationshipRead(
                    source_concept_name=r.source_concept_name,
                    source_concept_id=None,
                    target_concept_id=r.target_concept_id,
                    target_concept_name=r.target_concept_name,
                    relationship=r.relationship,
                    reason=r.reason,
                )
                for r in rel_reads
            ],
            broad_tags=broad_preview,
            card_summary=card_summary or None,
        )

    if concepts_raw:
        name_to_real_id = _replace_extracted_concepts_attachment(
            db,
            user_id,
            item,
            concepts_raw,
            concept_source="ai_generated",
        )
    else:
        db.query(LearningItemConcept).filter(
            LearningItemConcept.learning_item_id == item.id
        ).delete(synchronize_session=False)
        name_to_real_id = {}

    db.flush()
    _resolve_rel_target_ids_in_place(db, user_id, pending_rels)

    if data.apply_links and pending_rels and name_to_real_id:
        _persist_concept_edges(
            db,
            user_id,
            pending_rels,
            names_to_source_ids=name_to_real_id,
            allowed_targets=_all_concept_ids_for_user(db, user_id),
        )

    broad_apply = _broad_tags_from_payload(payload)
    if data.suggest_broad_tags and broad_apply:
        wit = _get_item_owned(db, user_id, item_id)
        merged = _merge_item_tags_with_ai_suggestions(wit, broad_apply)
        _sync_item_tags(db, user_id, wit, merged, tag_source="ai_generated")

    if do_commit:
        db.commit()
    else:
        db.flush()
    fresh = _get_item_owned(db, user_id, item_id)

    id_map = _concept_id_to_name_map(db, user_id)

    resolved_rels = _relationship_reads_from_ai(
        pending_rels,
        allowed_target_ids=set(id_map.keys()),
        id_to_title=id_map,
        names_to_source_ids=name_to_real_id if name_to_real_id else None,
        resolve_source_ids=bool(name_to_real_id),
    )

    rel_out: list[LearningRelationshipRead] = []
    for r in resolved_rels:
        rel_out.append(
            LearningRelationshipRead(
                source_concept_id=r.source_concept_id,
                source_concept_name=r.source_concept_name
                or (id_map.get(r.source_concept_id) if r.source_concept_id else None),
                target_concept_id=r.target_concept_id,
                target_concept_name=r.target_concept_name
                or (
                    id_map.get(r.target_concept_id or 0)
                    if r.target_concept_id
                    else None
                ),
                relationship=r.relationship,
                reason=r.reason,
            )
        )

    return LearningExtractConceptsResponse(
        applied=True,
        item=_item_to_read(fresh),
        concepts=_concept_attachments_to_read(fresh),
        relationships=rel_out,
        broad_tags=broad_apply,
        card_summary=card_summary or None,
    )


@router.post(
    "/items/{item_id}/ai-extract-concepts",
    response_model=LearningExtractConceptsResponse,
)
def ai_extract_concepts(
    item_id: int,
    data: LearningExtractConceptsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Attach concepts, optional concept→concept edges, and optional broad tag suggestions."""
    return _run_ai_extract_concepts(db, current_user.id, item_id, data)


@router.post(
    "/items/{item_id}/apply-suggested-tags",
    response_model=LearningExtractConceptsResponse,
)
def apply_suggested_tags(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Historical alias — runs AI concept extraction (concept graph attach, not tag sync)."""
    return _run_ai_extract_concepts(
        db,
        current_user.id,
        item_id,
        LearningExtractConceptsRequest(apply=True, apply_links=True),
    )


@router.post("/items/{item_id}/approve", response_model=LearningItemRead)
def approve_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = _get_item_owned(db, current_user.id, item_id)
    item.status = "approved"
    for t in item.tags:
        if t.status == "draft":
            t.status = "approved"
    for att in getattr(item, "concept_attachments", None) or []:
        lc = att.concept
        if lc and lc.status == "draft":
            lc.status = "approved"
    db.commit()
    fresh = _get_item_owned(db, current_user.id, item_id)
    return _item_to_read(fresh)


@router.post("/items/{item_id}/review", status_code=201)
def record_review(
    item_id: int,
    data: ReviewRecordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = _get_item_owned(db, current_user.id, item_id, load_graph=False)
    if item.status != "approved":
        raise HTTPException(
            status_code=400,
            detail="Only approved items can be reviewed.",
        )
    if item.type != "flashcard":
        raise HTTPException(
            status_code=400,
            detail="Review is only supported for flashcards in V1.",
        )
    db.add(
        LearningItemReview(
            user_id=current_user.id,
            learning_item_id=item.id,
            ease=data.ease,
        )
    )
    db.commit()
    return {"ok": True}


@router.post("/ai/ask", response_model=LearningAskResponse)
def learning_ask(
    data: LearningAskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    system = _get_prompt(db, "learning_ask", DEFAULT_LEARNING_ASK)
    extra = ""
    if data.context_item_id is not None:
        item = _get_item_owned(db, current_user.id, data.context_item_id)
        extra = (
            "\n\n---\nContext from saved card:\n"
            f"Title: {item.title}\n"
            f"Notion level: {_notion_level_on_item_row(item)}\n"
            f"Body (JSON): {item.content}\n"
        )
    answer = _call_openai_text(system, data.message.strip() + extra)
    return LearningAskResponse(answer=answer)


@router.post("/ai/generate-flashcards", response_model=LearningBatchCreateResponse)
def generate_flashcards(
    data: LearningGenerateFlashcardsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk-generate drafts, then run the same extract-concepts AI on each draft (attachments + broad_tags)."""
    system = _get_prompt(db, "learning_generate_flashcards", DEFAULT_LEARNING_GENERATE)
    target_nl = _resolve_notion_level(data.target_notion_level)
    user_msg = (
        f"Topic: {data.topic.strip()}\n"
        f"Number of flashcards: {data.count}\n"
        f"Target notion level for this entire batch: {target_nl}. "
        f'Every card must use notion_level exactly "{target_nl}" '
        "(elementary foundations, intermediate on-the-job interview depth, or expert sharp edge cases)."
        " Match question difficulty and answer depth to this level.\n"
        "Each answer string must contain newline characters between sentences or logical phrases — not one uninterrupted block.\n"
    )
    if data.audience:
        user_msg += f"Audience / depth: {data.audience.strip()}\n"

    raw = _call_openai_json(system, user_msg)
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=502,
            detail="AI returned invalid JSON.",
        )
    cards = payload.get("flashcards")
    if not isinstance(cards, list) or not cards:
        raise HTTPException(
            status_code=502,
            detail='AI JSON must contain a non-empty "flashcards" array.',
        )

    created_ids: list[int] = []
    batch_audience: str | None = None
    if data.audience and str(data.audience).strip():
        batch_audience = str(data.audience).strip()[:2048]
    for card in cards:
        if not isinstance(card, dict):
            continue
        q = (card.get("question") or "").strip()
        ans = _answer_readable_line_breaks((card.get("answer") or "").strip())
        if not q or not ans:
            continue
        content = {
            "answer": ans,
            "learning_goal": card.get("learning_goal"),
            "expected_depth": card.get("expected_depth"),
            "audience": batch_audience,
            "common_mistake": card.get("common_mistake"),
            "example": card.get("example"),
            "related_to": card.get("related_to"),
        }
        body = LearningItemCreateBody(
            type="flashcard",
            title=q[:512],
            content=content,
            status="draft",
            source="ai_generated",
            source_topic=data.topic.strip()[:512],
            tag_names=[],
            concept_ids=[],
            notion_level=target_nl,
        )
        item = _create_one_item(
            db, current_user.id, body, default_source="ai_generated"
        )
        created_ids.append(item.id)
    if not created_ids:
        raise HTTPException(
            status_code=502,
            detail="AI produced no valid flashcards.",
        )
    extract_defaults = LearningExtractConceptsRequest(
        apply=True, apply_links=True, suggest_broad_tags=True
    )
    for item_id in created_ids:
        _run_ai_extract_concepts(
            db,
            current_user.id,
            item_id,
            extract_defaults,
            do_commit=False,
        )
    db.commit()
    ordered = _reload_items_ordered(db, created_ids)
    return LearningBatchCreateResponse(items=[_item_to_read(i) for i in ordered])


@router.get("/graph", response_model=LearningGraphResponse)
def get_graph(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = current_user.id
    concepts = (
        db.query(LearningConcept)
        .filter(LearningConcept.user_id == user_id)
        .order_by(LearningConcept.id.asc())
        .all()
    )
    cid_list = [c.id for c in concepts]
    counts: dict[int, int] = {cid: 0 for cid in cid_list}
    if cid_list:
        tally = (
            db.query(
                LearningItemConcept.concept_id,
                func.count(LearningItemConcept.learning_item_id),
            )
            .filter(LearningItemConcept.concept_id.in_(cid_list))
            .group_by(LearningItemConcept.concept_id)
            .all()
        )
        for cid_n, ct in tally:
            counts[cid_n] = ct

    nodes = [
        GraphNode(id=c.id, title=c.name, item_count=counts.get(int(c.id), 0))
        for c in concepts
    ]
    edges = (
        db.query(ConceptRelationship)
        .filter(ConceptRelationship.user_id == user_id)
        .all()
    )
    return LearningGraphResponse(
        nodes=nodes,
        edges=[
            GraphEdge(
                id=E.id,
                source_concept_id=E.source_concept_id,
                target_concept_id=E.target_concept_id,
                relation_type=E.relation_type,
                reason=E.reason,
            )
            for E in edges
        ],
    )
