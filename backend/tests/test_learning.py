"""Learning Centre API smoke tests."""

from __future__ import annotations

import json
from unittest.mock import patch


def test_learning_create_search_approve(client, auth_headers):
    h = auth_headers
    r = client.post(
        "/api/learning/items",
        headers=h,
        json={
            "items": [
                {
                    "type": "flashcard",
                    "title": "What is Docker?",
                    "content": {"answer": "A packaging format for containers."},
                    "status": "draft",
                }
            ]
        },
    )
    assert r.status_code == 200, r.text
    item_id = r.json()["items"][0]["id"]

    r = client.post("/api/learning/search", headers=h, json={"query": "Docker"})
    assert r.status_code == 200
    assert r.json()["matches"] == []

    r = client.post(f"/api/learning/items/{item_id}/approve", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"

    r = client.post("/api/learning/search", headers=h, json={"query": "Docker"})
    assert r.status_code == 200
    matches = r.json()["matches"]
    assert len(matches) == 1
    assert matches[0]["id"] == item_id
    assert matches[0].get("notion_level") == "intermediate"


def test_learning_notion_level_create_patch_and_filter(client, auth_headers):
    h = auth_headers
    r = client.post(
        "/api/learning/items",
        headers=h,
        json={
            "items": [
                {
                    "type": "note",
                    "title": "Notion note fixture",
                    "content": {"body_markdown": "Body"},
                    "status": "draft",
                    "notion_level": "expert",
                },
            ]
        },
    )
    assert r.status_code == 200, r.text
    note_id = r.json()["items"][0]["id"]
    assert r.json()["items"][0]["notion_level"] == "expert"

    r = client.get("/api/learning/drafts", headers=h)
    assert r.status_code == 200
    assert any(it["id"] == note_id for it in r.json())

    r = client.get(
        "/api/learning/drafts", headers=h, params={"notion_level": "elementary"}
    )
    assert r.status_code == 200
    assert note_id not in [it["id"] for it in r.json()]

    r = client.patch(
        f"/api/learning/items/{note_id}", headers=h, json={"notion_level": "elementary"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["notion_level"] == "elementary"

    r = client.get(
        "/api/learning/drafts", headers=h, params={"notion_level": "elementary"}
    )
    assert r.status_code == 200
    assert note_id in [it["id"] for it in r.json()]


def test_learning_search_includes_attached_concept_names(client, auth_headers):
    """Search matches approved cards by linked LearningConcept rows."""
    h = auth_headers

    r = client.post(
        "/api/learning/concepts",
        headers=h,
        json={"name": "zebra_unique_concept_node"},
    )
    assert r.status_code == 200, r.text
    concept_id = r.json()["id"]

    r = client.post(
        "/api/learning/items",
        headers=h,
        json={
            "items": [
                {
                    "type": "flashcard",
                    "title": "Obscure title qwfp",
                    "content": {"answer": "Short."},
                    "status": "draft",
                    "tag_names": [],
                    "concept_ids": [concept_id],
                }
            ]
        },
    )
    assert r.status_code == 200, r.text
    item_id = r.json()["items"][0]["id"]
    r = client.post(f"/api/learning/items/{item_id}/approve", headers=h)
    assert r.status_code == 200, r.text

    r = client.post(
        "/api/learning/search", headers=h, json={"query": "zebra_unique_concept_node"}
    )
    assert r.status_code == 200, r.text
    ids = [m["id"] for m in r.json()["matches"]]
    assert item_id in ids

    r = client.post(
        "/api/learning/search", headers=h, json={"query": "zebra_unique_wrong"}
    )
    assert r.status_code == 200
    assert all(m["id"] != item_id for m in r.json()["matches"])


def test_learning_search_matches_source_topic_label(client, auth_headers):
    """Query can match source_topic alone so all approved cards in a session are discoverable."""
    h = auth_headers
    r = client.post(
        "/api/learning/items",
        headers=h,
        json={
            "items": [
                {
                    "type": "flashcard",
                    "title": "Obscure title xyzzy_nope",
                    "content": {"answer": "Minimal."},
                    "status": "draft",
                    "source_topic": "unique_session_label_xyzzy",
                    "tag_names": [],
                }
            ]
        },
    )
    assert r.status_code == 200, r.text
    item_id = r.json()["items"][0]["id"]
    r = client.post(f"/api/learning/items/{item_id}/approve", headers=h)
    assert r.status_code == 200, r.text

    r = client.post(
        "/api/learning/search", headers=h, json={"query": "unique_session_label_xyzzy"}
    )
    assert r.status_code == 200, r.text
    ids = [m["id"] for m in r.json()["matches"]]
    assert item_id in ids


def test_learning_review_flashcard(client, auth_headers):
    h = auth_headers
    r = client.post(
        "/api/learning/items",
        headers=h,
        json={
            "items": [
                {
                    "type": "flashcard",
                    "title": "Q",
                    "content": {"answer": "A"},
                    "status": "approved",
                }
            ]
        },
    )
    assert r.status_code == 200
    item_id = r.json()["items"][0]["id"]

    r = client.post(
        f"/api/learning/items/{item_id}/review",
        headers=h,
        json={"ease": "good"},
    )
    assert r.status_code == 201, r.text


def test_learning_clear_centre_only(client, auth_headers):
    """POST /api/reset/clear-learning removes learning rows but leaves account usable."""
    h = auth_headers
    r = client.post(
        "/api/learning/items",
        headers=h,
        json={
            "items": [
                {
                    "type": "flashcard",
                    "title": "Flash",
                    "content": {"answer": "A"},
                    "status": "draft",
                    "tag_names": ["t1"],
                }
            ]
        },
    )
    assert r.status_code == 200, r.text
    item_id = r.json()["items"][0]["id"]

    r = client.post("/api/reset/clear-learning", headers=h)
    assert r.status_code == 200, r.text
    assert "learning" in r.json()["message"].lower()

    r = client.get(f"/api/learning/items/{item_id}", headers=h)
    assert r.status_code == 404

    r = client.get("/api/reset/soft-deleted-count", headers=h)
    assert r.status_code == 200


def test_learning_reset_wipes_items(client, auth_headers):
    h = auth_headers
    r = client.post(
        "/api/learning/items",
        headers=h,
        json={
            "items": [
                {
                    "type": "flashcard",
                    "title": "Keep",
                    "content": {"answer": "X"},
                    "status": "approved",
                }
            ]
        },
    )
    assert r.status_code == 200

    r = client.post("/api/reset", headers=h)
    assert r.status_code == 200, r.text

    r = client.post("/api/learning/search", headers=h, json={"query": "Keep"})
    assert r.status_code == 200
    assert r.json()["matches"] == []


def test_learning_no_auto_tags_when_none_provided(client, auth_headers):
    """Creating items with empty tag_names does not infer tags; use AI extract or add tags manually."""
    h = auth_headers
    r = client.post(
        "/api/learning/items",
        headers=h,
        json={
            "items": [
                {
                    "type": "flashcard",
                    "title": "How do you inject secrets in CI/CD pipelines?",
                    "content": {
                        "answer": "Use secret managers and runtime injection.",
                        "related_to": "GitHub Actions, GCP Secret Manager",
                    },
                    "source_topic": "DevOps interview",
                    "status": "draft",
                    "tag_names": [],
                }
            ]
        },
    )
    assert r.status_code == 200, r.text
    item = r.json()["items"][0]
    assert item.get("tags") in (None, [])


@patch("app.api.learning._call_openai_json")
def test_learning_generate_flashcards_runs_extract_on_each_draft(
    mock_llm, client, auth_headers
):
    """POST /ai/generate-flashcards runs the extract-concepts prompt per created card (tags + concepts)."""
    gen = json.dumps(
        {
            "flashcards": [
                {
                    "question": "What is a container?",
                    "answer": "An isolated process view.\nWith its own filesystem slice.",
                    "learning_goal": "Recall basics",
                    "expected_depth": "elementary",
                    "common_mistake": "Confusing with VM",
                    "example": "docker run",
                    "related_to": "Docker",
                    "notion_level": "elementary",
                }
            ]
        }
    )
    ext = json.dumps(
        {
            "concepts": [
                {"name": "Docker", "type": "mechanism", "importance": "primary"}
            ],
            "relationships": [],
            "broad_tags": ["containers", "devops"],
        }
    )
    mock_llm.side_effect = [gen, ext]

    h = auth_headers
    r = client.post(
        "/api/learning/ai/generate-flashcards",
        headers=h,
        json={"topic": "Containers", "count": 1, "target_notion_level": "elementary"},
    )
    assert r.status_code == 200, r.text
    assert mock_llm.call_count == 2
    items = r.json()["items"]
    assert len(items) == 1
    cnames = [c["name"].lower() for c in items[0].get("concepts", [])]
    assert any("docker" in n for n in cnames)
    tag_names = [t["name"].lower() for t in items[0].get("tags", [])]
    assert "containers" in tag_names
    assert "devops" in tag_names


@patch("app.api.learning._call_openai_json")
def test_learning_apply_suggested_tags_runs_ai_extract_concepts_and_broad_tags(
    mock_llm, client, auth_headers
):
    mock_llm.return_value = json.dumps(
        {
            "concepts": [
                {"name": "Terraform", "type": "mechanism", "importance": "primary"},
            ],
            "relationships": [],
            "broad_tags": ["iac", "terraform"],
        }
    )
    h = auth_headers
    r = client.post(
        "/api/learning/items",
        headers=h,
        json={
            "items": [
                {
                    "type": "flashcard",
                    "title": "Plain title about Terraform",
                    "content": {"answer": "IaC"},
                    "status": "draft",
                    "tag_names": ["manual-only"],
                }
            ]
        },
    )
    assert r.status_code == 200
    item_id = r.json()["items"][0]["id"]

    r = client.post(
        f"/api/learning/items/{item_id}/apply-suggested-tags",
        headers=h,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["applied"] is True
    cnames = [c["name"] for c in data["item"]["concepts"]]
    assert any("terraform" == n.lower() for n in cnames)
    tag_names = [t["name"] for t in data["item"]["tags"]]
    lowered = [t.lower() for t in tag_names]
    assert "manual-only" in lowered
    assert "iac" in lowered


@patch("app.api.learning._call_openai_json")
def test_learning_extract_concepts_persists_concept_edge_hyphen_and_target_id_alias(
    mock_llm, client, auth_headers
):
    """Concept edges accept hyphen relationship and target_id string as target_concept_id."""
    from app.db import SessionLocal
    from app.models import ConceptRelationship, LearningConcept

    h = auth_headers
    r = client.post(
        "/api/learning/concepts",
        headers=h,
        json={"name": "Existing target concept B"},
    )
    assert r.status_code == 200, r.text
    tgt_cid = r.json()["id"]

    r = client.post(
        "/api/learning/items",
        headers=h,
        json={
            "items": [
                {
                    "type": "flashcard",
                    "title": "A",
                    "content": {"answer": "a"},
                    "status": "draft",
                },
            ]
        },
    )
    assert r.status_code == 200, r.text
    src_id = r.json()["items"][0]["id"]

    mock_llm.return_value = json.dumps(
        {
            "concepts": [
                {"name": "secrets", "type": "mechanism", "importance": "primary"}
            ],
            "relationships": [
                {
                    "source_concept_name": "secrets",
                    "target_concept_name": "Existing target concept B",
                    "relationship": "related-to",
                    "reason": "Both ideas connect to secret handling in delivery pipelines.",
                }
            ],
        }
    )

    r = client.post(
        f"/api/learning/items/{src_id}/ai-extract-concepts",
        headers=h,
        json={"apply": True, "apply_links": True},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data["relationships"]) == 1
    assert data["relationships"][0]["relationship"] == "related_to"

    with SessionLocal() as db:
        src_crow = db.query(LearningConcept).filter_by(name="secrets").first()
        assert src_crow is not None
        row = (
            db.query(ConceptRelationship)
            .filter(
                ConceptRelationship.source_concept_id == src_crow.id,
                ConceptRelationship.target_concept_id == tgt_cid,
                ConceptRelationship.relation_type == "related_to",
            )
            .first()
        )
        assert row is not None


@patch("app.api.learning._call_openai_json")
def test_learning_extract_concepts_accepts_top_level_links_key(
    mock_llm, client, auth_headers
):
    from app.db import SessionLocal
    from app.models import ConceptRelationship, LearningConcept

    h = auth_headers
    r = client.post(
        "/api/learning/concepts",
        headers=h,
        json={"name": "Target B"},
    )
    tgt_cid = r.json()["id"]

    r = client.post(
        "/api/learning/items",
        headers=h,
        json={
            "items": [
                {
                    "type": "flashcard",
                    "title": "A",
                    "content": {"answer": "a"},
                    "status": "draft",
                },
            ]
        },
    )
    assert r.status_code == 200, r.text
    src_item_id = r.json()["items"][0]["id"]

    mock_llm.return_value = json.dumps(
        {
            "concepts": [
                {"name": "alpha", "type": "principle", "importance": "primary"}
            ],
            "links": [
                {
                    "source_concept_name": "alpha",
                    "target_concept_id": tgt_cid,
                    "relationship": "deepens",
                    "reason": "One idea deepens the other in practical interview depth.",
                }
            ],
        }
    )

    r = client.post(
        f"/api/learning/items/{src_item_id}/ai-extract-concepts",
        headers=h,
        json={"apply": True, "apply_links": True},
    )
    assert r.status_code == 200, r.text
    assert len(r.json()["relationships"]) == 1

    with SessionLocal() as db:
        sa = db.query(LearningConcept).filter_by(name="alpha").first()
        assert sa is not None
        row = (
            db.query(ConceptRelationship)
            .filter(ConceptRelationship.source_concept_id == sa.id)
            .first()
        )
        assert row is not None


def test_learning_create_with_empty_tags_leaves_tags_empty(client, auth_headers):
    """Heuristic tagging from body text was removed; long answers do not auto-populate tags."""
    h = auth_headers
    r = client.post(
        "/api/learning/items",
        headers=h,
        json={
            "items": [
                {
                    "type": "flashcard",
                    "title": (
                        "How do you structure a GitHub Actions workflow to access secrets "
                        "conditionally based on branch protection rules?"
                    ),
                    "content": {
                        "answer": (
                            "You can utilise conditional statements in combination with your branch "
                            "protection rules to control secret access. For example, only allow secrets "
                            "to be exposed in workflows that run on protected branches like 'main'. "
                            "Configure your workflow file to include an `if: github.ref == 'refs/heads/main'` "
                            "condition, ensuring that it only runs the steps accessing sensitive secrets when "
                            "the code is merged into the main branch."
                        ),
                        "learning_goal": (
                            "Learn to align secrets access with branch protection strategies "
                            "in CI/CD implementations."
                        ),
                        "common_mistake": (
                            "Not enforcing strict conditions, leading to secrets being available on "
                            "less-secure branches."
                        ),
                        "related_to": "ci/cd secrets with GitHub actions, Branch protection",
                    },
                    "status": "draft",
                    "tag_names": [],
                }
            ]
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["items"][0].get("tags") in (None, [])


def test_learning_delete_item(client, auth_headers):
    h = auth_headers
    r = client.post(
        "/api/learning/items",
        headers=h,
        json={
            "items": [
                {
                    "type": "flashcard",
                    "title": "To delete",
                    "content": {"answer": "X"},
                    "status": "draft",
                }
            ]
        },
    )
    assert r.status_code == 200
    item_id = r.json()["items"][0]["id"]

    r = client.delete(f"/api/learning/items/{item_id}", headers=h)
    assert r.status_code == 204, r.text

    r = client.get(f"/api/learning/items/{item_id}", headers=h)
    assert r.status_code == 404


@patch("app.api.learning._call_openai_json")
def test_learning_ai_refresh_preview_flashcard(mock_llm, client, auth_headers):
    mock_llm.return_value = (
        '{"question":"New title","answer":"New body","learning_goal":"G"}'
    )
    h = auth_headers
    r = client.post(
        "/api/learning/items",
        headers=h,
        json={
            "items": [
                {
                    "type": "flashcard",
                    "title": "Old title",
                    "content": {"answer": "Old body"},
                    "status": "draft",
                }
            ]
        },
    )
    assert r.status_code == 200
    item_id = r.json()["items"][0]["id"]

    r = client.post(
        f"/api/learning/items/{item_id}/ai-refresh",
        headers=h,
        json={"apply": False},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["applied"] is False
    assert data["item"] is None
    assert data["proposal_title"] == "New title"
    assert data["proposal_content"]["answer"] == "New body"
    assert data["proposal_content"]["learning_goal"] == "G"


@patch("app.api.learning._call_openai_json")
def test_learning_ai_refresh_apply_updates_item(mock_llm, client, auth_headers):
    mock_llm.return_value = '{"question":"Apply Q","answer":"Apply A"}'
    h = auth_headers
    r = client.post(
        "/api/learning/items",
        headers=h,
        json={
            "items": [
                {
                    "type": "flashcard",
                    "title": "T0",
                    "content": {"answer": "A0"},
                    "status": "draft",
                }
            ]
        },
    )
    item_id = r.json()["items"][0]["id"]

    r = client.post(
        f"/api/learning/items/{item_id}/ai-refresh",
        headers=h,
        json={"apply": True},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["applied"] is True
    assert data["item"]["title"] == "Apply Q"
    assert data["item"]["content"]["answer"] == "Apply A"


def test_learning_graph_is_concepts_not_cards(client, auth_headers):
    h = auth_headers
    r = client.post(
        "/api/learning/concepts", headers=h, json={"name": "Graph node one"}
    )
    assert r.status_code == 200, r.text
    a = r.json()["id"]
    r = client.post(
        "/api/learning/concepts", headers=h, json={"name": "Graph node two"}
    )
    b = r.json()["id"]
    r = client.post(
        "/api/learning/concept-relationships",
        headers=h,
        json={
            "source_concept_id": a,
            "target_concept_id": b,
            "relationship": "related_to",
            "reason": "Coordinating test edge.",
        },
    )
    assert r.status_code == 200, r.text

    r = client.get("/api/learning/graph", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    ids = {n["id"] for n in data["nodes"]}
    assert a in ids and b in ids
    assert any(
        e["source_concept_id"] == a and e["target_concept_id"] == b
        for e in data["edges"]
    )


def test_learning_concept_explore_neighbours_and_cards(client, auth_headers):
    h = auth_headers
    r = client.post("/api/learning/concepts", headers=h, json={"name": "Explore Alpha"})
    assert r.status_code == 200, r.text
    a = r.json()["id"]
    r = client.post("/api/learning/concepts", headers=h, json={"name": "Explore Beta"})
    b = r.json()["id"]
    r = client.post(
        "/api/learning/concept-relationships",
        headers=h,
        json={
            "source_concept_id": a,
            "target_concept_id": b,
            "relationship": "depends_on",
            "reason": "Topic ordering for explore test.",
        },
    )
    assert r.status_code == 200, r.text
    r = client.post(
        "/api/learning/items",
        headers=h,
        json={
            "items": [
                {
                    "type": "flashcard",
                    "title": "Q for explore",
                    "content": {"answer": "A"},
                    "status": "draft",
                    "tag_names": [],
                    "concept_ids": [a],
                }
            ]
        },
    )
    assert r.status_code == 200, r.text

    r = client.get(f"/api/learning/concepts/{a}/explore", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["concept"]["id"] == a
    assert len(data["outgoing_edges"]) == 1
    assert data["outgoing_edges"][0]["target_concept_id"] == b
    assert data["outgoing_edges"][0]["relation_type"] == "depends_on"
    assert len(data["incoming_edges"]) == 0
    assert len(data["linked_items"]) == 1
    assert data["linked_items"][0]["title"] == "Q for explore"

    r = client.get(f"/api/learning/concepts/{b}/explore", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data["incoming_edges"]) == 1
    assert data["incoming_edges"][0]["source_concept_id"] == a
    assert len(data["outgoing_edges"]) == 0


def test_learning_patch_save_suggests_graph_edges(client, auth_headers):
    """extract_graph_edges on PATCH runs edge LLM and persists valid concept_relationships."""
    from app.db import SessionLocal
    from app.models import ConceptRelationship

    h = auth_headers
    r = client.post(
        "/api/learning/concepts", headers=h, json={"name": "EdgeSave Source"}
    )
    assert r.status_code == 200, r.text
    src_cid = r.json()["id"]
    r = client.post(
        "/api/learning/concepts", headers=h, json={"name": "EdgeSave Target"}
    )
    assert r.status_code == 200, r.text
    dst_cid = r.json()["id"]

    r = client.post(
        "/api/learning/items",
        headers=h,
        json={
            "items": [
                {
                    "type": "flashcard",
                    "title": "Q",
                    "content": {"answer": "A"},
                    "status": "draft",
                    "concept_ids": [src_cid, dst_cid],
                }
            ]
        },
    )
    assert r.status_code == 200, r.text
    item_id = r.json()["items"][0]["id"]

    r = client.get(f"/api/learning/items/{item_id}", headers=h)
    assert r.status_code == 200, r.text
    assert len(r.json()["concepts"]) == 2

    with patch("app.api.learning._call_openai_json") as mock_llm:
        mock_llm.return_value = json.dumps(
            {
                "relationships": [
                    {
                        "source_concept_name": "EdgeSave Source",
                        "target_concept_id": dst_cid,
                        "relationship": "related_to",
                        "reason": "Both labels are used together in this synthetic card for pytest.",
                    }
                ]
            }
        )

        r = client.patch(
            f"/api/learning/items/{item_id}",
            headers=h,
            json={
                "title": "Q2",
                "content": {"answer": "A2"},
                "extract_graph_edges": True,
            },
        )
        assert r.status_code == 200, r.text
        mock_llm.assert_called()
    with SessionLocal() as db:
        row = (
            db.query(ConceptRelationship)
            .filter(
                ConceptRelationship.source_concept_id == src_cid,
                ConceptRelationship.target_concept_id == dst_cid,
                ConceptRelationship.relation_type == "related_to",
            )
            .first()
        )
        assert row is not None

    with patch("app.api.learning._call_openai_json") as mock_llm2:
        mock_llm2.return_value = json.dumps({"relationships": []})
        r = client.patch(
            f"/api/learning/items/{item_id}",
            headers=h,
            json={
                "title": "Q3",
                "content": {"answer": "A3"},
                "extract_graph_edges": False,
            },
        )
        assert r.status_code == 200, r.text
        mock_llm2.assert_not_called()
