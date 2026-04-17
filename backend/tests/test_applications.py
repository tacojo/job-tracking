"""Applications CRUD and user isolation."""

from app.db import SessionLocal
from app.models import Application, Company, Role, User


def test_create_and_list_application(client, auth_headers):
    r = client.post(
        "/api/applications",
        json={"company": "Acme Corp", "role": "Backend Engineer"},
        headers=auth_headers,
    )
    assert r.status_code == 201
    data = r.json()
    assert data["company"] == "Acme Corp"
    assert data["role"] == "Backend Engineer"
    assert "id" in data
    assert "uuid" in data

    r = client.get("/api/applications", headers=auth_headers)
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) >= 1
    companies = {x["company"] for x in rows}
    assert "Acme Corp" in companies


def test_get_application_by_id(client, auth_headers):
    r = client.post(
        "/api/applications",
        json={"company": "Beta Inc", "role": "Developer"},
        headers=auth_headers,
    )
    assert r.status_code == 201
    app_id = r.json()["id"]

    r = client.get(f"/api/applications/{app_id}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["company"] == "Beta Inc"


def test_cannot_access_other_users_application(client, auth_headers):
    r = client.post(
        "/api/applications",
        json={"company": "Mine", "role": "Role"},
        headers=auth_headers,
    )
    assert r.status_code == 201

    db = SessionLocal()
    try:
        other = User(
            google_id="other_isolated_user", email="other@example.com", name="Other"
        )
        db.add(other)
        db.flush()
        company = Company(user_id=other.id, name="TheirCo")
        db.add(company)
        db.flush()
        role = Role(user_id=other.id, name="TheirRole")
        db.add(role)
        db.flush()
        other_app = Application(
            user_id=other.id, company_id=company.id, role_id=role.id
        )
        db.add(other_app)
        db.commit()
        other_app_id = other_app.id
    finally:
        db.close()

    r = client.get(f"/api/applications/{other_app_id}", headers=auth_headers)
    assert r.status_code == 404
