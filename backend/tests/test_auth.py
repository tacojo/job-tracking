"""Auth: JWT and dev login."""


def test_dev_login_returns_token(client):
    r = client.get("/api/v1/auth/dev-login")
    assert r.status_code == 200
    body = r.json()
    assert "auth_token" in body
    assert len(body["auth_token"]) > 20


def test_me_requires_authentication(client):
    r = client.get("/api/v1/auth/me")
    assert r.status_code == 401


def test_me_with_bearer_token(client, auth_headers):
    r = client.get("/api/v1/auth/me", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == "dev@local.test"
    assert "id" in data


def test_applications_requires_authentication(client):
    r = client.get("/api/applications")
    assert r.status_code == 401
