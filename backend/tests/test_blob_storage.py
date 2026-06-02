"""Blob storage fallback behaviour."""

from __future__ import annotations

from pathlib import Path

from app.config import settings
from app.services import blob_storage


class _Response:
    def __init__(self, status_code: int, content: bytes = b""):
        self.status_code = status_code
        self.content = content

    def raise_for_status(self) -> None:
        raise AssertionError(f"unexpected HTTP status {self.status_code}")


class _MissingSupabaseClient:
    def get(self, path: str) -> _Response:
        return _Response(500)


class _BadDeleteSupabaseClient(_MissingSupabaseClient):
    def __init__(self):
        self.requests: list[tuple[str, str, dict]] = []

    def request(self, method: str, path: str, **kwargs) -> _Response:
        self.requests.append((method, path, kwargs))
        return _Response(400)


def test_supabase_mode_reads_existing_local_fallback(tmp_path, monkeypatch):
    files_root = tmp_path / "files"
    key = "files/users/1/applications/app-1/originals/jd/job_spec.txt"
    local_path = files_root / key.removeprefix("files/")
    local_path.parent.mkdir(parents=True)
    local_path.write_bytes(b"hello from local storage")

    monkeypatch.setattr(settings, "storage_backend", "supabase")
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role_key", "service-role")
    monkeypatch.setattr(settings, "supabase_storage_bucket", "job-tracker-files")
    monkeypatch.setattr(settings, "files_root", str(files_root))
    monkeypatch.setattr(blob_storage, "_client", _MissingSupabaseClient())

    assert blob_storage.exists(key) is True
    assert blob_storage.open_local_path(key) == Path(local_path)
    assert blob_storage.read_bytes(key) == b"hello from local storage"


def test_supabase_mode_delete_removes_existing_local_fallback(tmp_path, monkeypatch):
    files_root = tmp_path / "files"
    key = "files/users/1/applications/app-1/originals/jd/job_spec.txt"
    local_path = files_root / key.removeprefix("files/")
    local_path.parent.mkdir(parents=True)
    local_path.write_bytes(b"delete me")
    client = _BadDeleteSupabaseClient()

    monkeypatch.setattr(settings, "storage_backend", "supabase")
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role_key", "service-role")
    monkeypatch.setattr(settings, "supabase_storage_bucket", "job-tracker-files")
    monkeypatch.setattr(settings, "files_root", str(files_root))
    monkeypatch.setattr(blob_storage, "_client", client)

    blob_storage.delete_key(key)

    assert local_path.exists() is False
    assert client.requests == [
        (
            "DELETE",
            "/storage/v1/object/job-tracker-files",
            {"json": {"prefixes": [key]}},
        )
    ]
