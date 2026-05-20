"""Pydantic schemas for Learning Centre API."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

ALLOWED_STATUS = frozenset({"draft", "approved", "archived"})
ALLOWED_SOURCE = frozenset({"ai_generated", "user_created", "imported"})
EASE_VALUES = frozenset({"again", "hard", "good", "easy"})


class FlashcardContentValidator(BaseModel):
    answer: str = Field(..., min_length=1)
    learning_goal: str | None = None
    expected_depth: str | None = None
    audience: str | None = Field(
        None,
        max_length=2048,
        description="Audience / depth hint (e.g. from Generate form), not the model's expected_depth field.",
    )
    common_mistake: str | None = None
    example: str | None = None
    related_to: str | None = None


class NoteContentValidator(BaseModel):
    body_markdown: str = Field(..., min_length=1)


class TagRead(BaseModel):
    id: int
    name: str
    status: str
    source: str

    model_config = {"from_attributes": True}


CONCEPT_TYPES = frozenset(
    {
        "principle",
        "tradeoff",
        "mechanism",
        "failure_mode",
        "design_pattern",
        "example_domain",
        "operational_concern",
        "common_mistake",
    }
)

CONCEPT_IMPORTANCE = frozenset({"primary", "secondary", "supporting"})
NOTION_LEVEL = frozenset({"elementary", "intermediate", "expert"})

LINK_RELATIONSHIP_TYPES = frozenset(
    {
        "applies_concept",
        "explains",
        "contrasts_with",
        "causes",
        "mitigates",
        "depends_on",
        "example_of",
        "prerequisite_for",
        "common_mistake_for",
        "follow_up_to",
        "related_to",
        "deepens",
        "reinforces",
    }
)


class LearningConceptRead(BaseModel):
    """Concept on the card; ``type`` is the pedagogical category from AI extract."""

    id: int | None = None
    name: str
    type: str
    importance: str


class LearningConceptCreateBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class LearningConceptBareRead(BaseModel):
    """Concept row without item attachment metadata."""

    id: int
    name: str
    status: str
    source: str

    model_config = {"from_attributes": True}


class ConceptRelationshipCreateBody(BaseModel):
    """Manual concept → concept edge."""

    source_concept_id: int
    target_concept_id: int
    relationship: str
    reason: str = ""

    @field_validator("relationship")
    @classmethod
    def validate_rel(cls, v: str) -> str:
        raw = str(v or "").strip().lower().replace("-", "_").replace(" ", "_")
        while "__" in raw:
            raw = raw.replace("__", "_")
        if raw not in LINK_RELATIONSHIP_TYPES:
            raise ValueError("invalid relationship type")
        return raw


class LearningRelationshipRead(BaseModel):
    source_concept_id: int | None = None
    source_concept_name: str | None = None
    target_concept_id: int | None = None
    target_concept_name: str | None = None
    relationship: str
    reason: str


class LearningItemRead(BaseModel):
    id: int
    type: str
    title: str
    content: dict[str, Any]
    search_text: str | None
    status: str
    source: str
    source_topic: str | None
    notion_level: str = "intermediate"
    tags: list[TagRead] = []
    concepts: list[LearningConceptRead] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LearningExtractConceptsRequest(BaseModel):
    """AI concept extraction: concept nodes, optional graph edges, optional broad tag suggestions."""

    apply: bool = False
    apply_links: bool = True
    suggest_broad_tags: bool = True


class LearningExtractConceptsResponse(BaseModel):
    applied: bool
    item: LearningItemRead | None = None
    concepts: list[LearningConceptRead] = []
    relationships: list[LearningRelationshipRead] = []
    broad_tags: list[str] = []
    card_summary: dict[str, Any] | None = Field(
        None,
        description="Echo of question/answer/goal/mistake from the model JSON if present.",
    )


class LearningSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)


class LearningSearchMatch(BaseModel):
    id: int
    type: str
    title: str
    notion_level: str = "intermediate"
    tags: list[TagRead] = []


class LearningSearchResponse(BaseModel):
    matches: list[LearningSearchMatch]


class LearningItemCreateBody(BaseModel):
    type: Literal["flashcard", "note"]
    title: str = Field(..., min_length=1, max_length=512)
    content: dict[str, Any]
    status: str | None = None
    source: str | None = None
    source_topic: str | None = None
    notion_level: str | None = None
    tag_names: list[str] = []
    concept_ids: list[int] = []

    @field_validator("notion_level")
    @classmethod
    def validate_notion_level_create(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = str(v).strip().lower()
        if s not in NOTION_LEVEL:
            raise ValueError("notion_level must be elementary, intermediate, or expert")
        return s

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if v not in ALLOWED_STATUS:
            raise ValueError("invalid status")
        return v

    @field_validator("source")
    @classmethod
    def validate_source(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if v not in ALLOWED_SOURCE:
            raise ValueError("invalid source")
        return v


class LearningBatchCreateRequest(BaseModel):
    items: list[LearningItemCreateBody] = Field(..., min_length=1)


class LearningBatchCreateResponse(BaseModel):
    items: list[LearningItemRead]


class LearningItemPatch(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=512)
    content: dict[str, Any] | None = None
    status: str | None = None
    source_topic: str | None = None
    notion_level: str | None = None
    tag_names: list[str] | None = None
    concept_ids: list[int] | None = None
    extract_graph_edges: bool = Field(
        default=False,
        description="If true, after a successful save run AI to suggest concept→concept edges (best-effort).",
    )

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if v not in ALLOWED_STATUS:
            raise ValueError("invalid status")
        return v

    @field_validator("notion_level")
    @classmethod
    def validate_notion_level_patch(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = str(v).strip().lower()
        if s not in NOTION_LEVEL:
            raise ValueError("notion_level must be elementary, intermediate, or expert")
        return s


class LearningAskRequest(BaseModel):
    message: str = Field(..., min_length=1)
    context_item_id: int | None = None


class LearningAskResponse(BaseModel):
    answer: str


class LearningGenerateFlashcardsRequest(BaseModel):
    topic: str = Field(..., min_length=1)
    audience: str | None = None
    count: int = Field(default=5, ge=1, le=20)
    target_notion_level: str = Field(
        default="intermediate",
        description="Pitch and save every draft at this elementary/intermediate/expert level.",
    )

    @field_validator("target_notion_level")
    @classmethod
    def validate_target_notion_level(cls, v: str) -> str:
        s = str(v or "").strip().lower()
        if s not in NOTION_LEVEL:
            raise ValueError(
                "target_notion_level must be elementary, intermediate, or expert"
            )
        return s


class ReviewRecordRequest(BaseModel):
    ease: str = Field(..., description="SRS ease button: again, hard, good, easy")

    @field_validator("ease")
    @classmethod
    def validate_ease(cls, v: str) -> str:
        if v not in EASE_VALUES:
            raise ValueError("ease must be one of: again, hard, good, easy")
        return v


class LearningAIRefreshRequest(BaseModel):
    """Refresh card body via AI. Preview (`apply=false`) returns text to edit; `apply=true` saves immediately."""

    apply: bool = False
    audience: str | None = Field(
        None, description="Optional depth / interview level hint for the rewrite."
    )


class LearningAIRefreshResponse(BaseModel):
    applied: bool
    item: LearningItemRead | None = None
    proposal_title: str | None = None
    proposal_content: dict[str, Any] | None = None
    proposal_notion_level: str | None = None


class GraphNode(BaseModel):
    """Knowledge graph vertex (one concept node)."""

    id: int
    title: str
    item_count: int


class GraphEdge(BaseModel):
    """Knowledge graph arc between two concepts."""

    id: int
    source_concept_id: int
    target_concept_id: int
    relation_type: str
    reason: str | None = None


class LearningGraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class ConceptExploreEdgeOut(BaseModel):
    """Directed edge from this concept to another."""

    edge_id: int
    target_concept_id: int
    target_name: str
    relation_type: str
    reason: str | None = None


class ConceptExploreEdgeIn(BaseModel):
    """Directed edge from another concept into this one."""

    edge_id: int
    source_concept_id: int
    source_name: str
    relation_type: str
    reason: str | None = None


class ConceptExploreItemRow(BaseModel):
    """Flashcard or note linked to this concept."""

    id: int
    type: str
    title: str
    status: str
    notion_level: str = "intermediate"


class ConceptExploreResponse(BaseModel):
    """Neighbour concepts + linked study items for exploration from the graph."""

    concept: LearningConceptBareRead
    outgoing_edges: list[ConceptExploreEdgeOut]
    incoming_edges: list[ConceptExploreEdgeIn]
    linked_items: list[ConceptExploreItemRow]


class ConceptRelationshipCreateResponse(BaseModel):
    id: int
    created: bool
