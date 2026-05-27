"""Pytest fixtures: test DB, fresh schema per test, auth helpers."""

from __future__ import annotations

import os
from collections.abc import Generator
from pathlib import Path

# Configure env before importing app (Settings loads at import time).
_TESTS_DIR = Path(__file__).resolve().parent
_TEST_DB = _TESTS_DIR / "test_app.db"
_TEST_STORAGE = _TESTS_DIR / "test_storage"

if _TEST_DB.exists():
    _TEST_DB.unlink()

os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB.as_posix()}"
os.environ["BYPASS_AUTH"] = "true"
os.environ["SUPERUSER_EMAILS"] = "dev@local.test"
os.environ["JWT_SECRET"] = "test-jwt-secret-key-for-pytest-only-min-32-chars"
os.environ["SECRETS_ENCRYPTION_KEY"] = "sDUvW-ouSt-_5AIX9suYDMxK5p4pg_W0IZyBmreeayU="
os.environ["STORAGE_PATH"] = str(_TEST_STORAGE)

import pytest
from fastapi.testclient import TestClient

from app.db import Base, engine, init_db
from app.main import app


@pytest.fixture(scope="session")
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _reset_database() -> Generator[None, None, None]:
    """Isolate each test with a clean schema + seed data."""
    Base.metadata.drop_all(bind=engine)
    init_db()
    yield


@pytest.fixture
def auth_headers(client: TestClient) -> dict[str, str]:
    r = client.get("/api/v1/auth/dev-login")
    assert r.status_code == 200, r.text
    token = r.json()["auth_token"]
    return {"Authorization": f"Bearer {token}"}
