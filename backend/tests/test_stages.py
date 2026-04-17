"""Stage pipeline validation."""


def test_first_stage_cannot_be_stage_number_without_initial(client, auth_headers):
    r = client.post(
        "/api/applications",
        json={"company": "StageCo", "role": "Eng"},
        headers=auth_headers,
    )
    assert r.status_code == 201
    application_id = r.json()["id"]

    r = client.post(
        f"/api/applications/{application_id}/stages",
        json={"stage_type": "STAGE_1"},
        headers=auth_headers,
    )
    assert r.status_code == 400
    detail = r.json()["detail"]
    assert "Applied" in detail or "Recruiter" in detail


def test_duplicate_applied_rejected(client, auth_headers):
    r = client.post(
        "/api/applications",
        json={"company": "DupCo", "role": "Eng"},
        headers=auth_headers,
    )
    assert r.status_code == 201
    application_id = r.json()["id"]

    r = client.post(
        f"/api/applications/{application_id}/stages",
        json={"stage_type": "APPLIED"},
        headers=auth_headers,
    )
    assert r.status_code == 201

    r = client.post(
        f"/api/applications/{application_id}/stages",
        json={"stage_type": "APPLIED"},
        headers=auth_headers,
    )
    assert r.status_code == 400
    assert "already exists" in r.json()["detail"].lower()


def test_applied_then_stage1_allowed(client, auth_headers):
    r = client.post(
        "/api/applications",
        json={"company": "FlowCo", "role": "Eng"},
        headers=auth_headers,
    )
    assert r.status_code == 201
    application_id = r.json()["id"]

    r = client.post(
        f"/api/applications/{application_id}/stages",
        json={"stage_type": "APPLIED"},
        headers=auth_headers,
    )
    assert r.status_code == 201

    r = client.post(
        f"/api/applications/{application_id}/stages",
        json={"stage_type": "STAGE_1"},
        headers=auth_headers,
    )
    assert r.status_code == 201
    assert r.json()["stage_type"] == "STAGE_1"
