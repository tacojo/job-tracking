"""Tests for per-user OpenAI API key storage via AI settings."""

from app.services.secret_crypto import decrypt_secret, encrypt_secret, mask_api_key


def test_secret_crypto_roundtrip():
    plain = "sk-test-key-abcdefghijklmnop"
    encrypted = encrypt_secret(plain)
    assert encrypted != plain
    assert decrypt_secret(encrypted) == plain


def test_mask_api_key():
    assert mask_api_key("sk-abcdefghijklmnopqrstuvwxyz") == "sk-abcd...wxyz"


def test_ai_settings_save_and_mask_openai_key(client, auth_headers):
    r = client.put(
        "/api/settings/ai",
        json={"openai_api_key": "sk-test-user-key-1234567890"},
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["openai_api_key_configured"] is True
    assert data["openai_api_key_masked"] == "sk-test...7890"
    assert "sk-test-user-key" not in str(data)

    r2 = client.get("/api/settings/ai", headers=auth_headers)
    assert r2.status_code == 200
    assert r2.json()["openai_api_key_configured"] is True


def test_ai_settings_clear_openai_key(client, auth_headers):
    client.put(
        "/api/settings/ai",
        json={"openai_api_key": "sk-test-clear-key-1234567890"},
        headers=auth_headers,
    )
    r = client.put(
        "/api/settings/ai",
        json={"clear_openai_api_key": True},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["openai_api_key_configured"] is False
    assert r.json()["openai_api_key_masked"] is None


def test_ai_requires_user_openai_key(client, auth_headers):
    r = client.post(
        "/api/learning/ai/ask",
        json={"message": "What is a hash map?"},
        headers=auth_headers,
    )
    assert r.status_code == 503, r.text
    assert "Settings" in r.json()["detail"]


def test_ai_works_after_user_saves_key(client, auth_headers):
    from unittest.mock import patch

    client.put(
        "/api/settings/ai",
        json={"openai_api_key": "sk-test-user-key-1234567890"},
        headers=auth_headers,
    )
    with patch(
        "app.api.learning._call_openai_text",
        return_value="A hash map maps keys to values.",
    ):
        r = client.post(
            "/api/learning/ai/ask",
            json={"message": "What is a hash map?"},
            headers=auth_headers,
        )
    assert r.status_code == 200, r.text
    assert r.json()["answer"]


def test_ai_settings_rejects_invalid_key(client, auth_headers):
    r = client.put(
        "/api/settings/ai",
        json={"openai_api_key": "not-a-valid-key"},
        headers=auth_headers,
    )
    assert r.status_code == 400
