"""Blob storage: local filesystem (dev) or Supabase Storage (production)."""

from __future__ import annotations

import io
import shutil
from pathlib import Path
from typing import Optional
from urllib.parse import quote

import httpx

from app.config import settings

_client: Optional[httpx.Client] = None


def _normalize_key(key: str) -> str:
    return key.replace("\\", "/").lstrip("/")


def _safe_join(root: Path, relative_key: str) -> Path:
    root_resolved = root.resolve()
    path = (root_resolved / _normalize_key(relative_key)).resolve()
    if path != root_resolved and root_resolved not in path.parents:
        raise ValueError("Storage path escapes configured storage root")
    return path


def key_for_app_document(relative_path: str) -> str:
    """Object key for application document paths (relative to files root)."""
    return _normalize_key(f"files/{relative_path}")


def key_for_upload(relative_path: str) -> str:
    """Object key for CV/cover letter paths (relative to storage_path)."""
    return _normalize_key(relative_path)


def _local_path_for_key(key: str) -> Path:
    key = _normalize_key(key)
    if key.startswith("files/"):
        return _safe_join(Path(settings.files_root), key[len("files/") :])
    return _safe_join(Path(settings.storage_path), key)


def _supabase_client() -> httpx.Client:
    global _client
    if _client is None:
        if not settings.supabase_url or not settings.supabase_service_role_key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required when "
                "STORAGE_BACKEND=supabase"
            )
        _client = httpx.Client(
            base_url=settings.supabase_url.rstrip("/"),
            headers={
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
                "apikey": settings.supabase_service_role_key,
            },
            timeout=120.0,
        )
    return _client


def write_bytes(
    key: str, content: bytes, content_type: str = "application/octet-stream"
) -> None:
    key = _normalize_key(key)
    if settings.uses_supabase_storage:
        bucket = settings.supabase_storage_bucket
        path = quote(key, safe="/")
        r = _supabase_client().post(
            f"/storage/v1/object/{bucket}/{path}",
            content=content,
            headers={
                "Content-Type": content_type,
                "x-upsert": "true",
            },
        )
        r.raise_for_status()
        return
    path = _local_path_for_key(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def read_bytes(key: str) -> bytes:
    key = _normalize_key(key)
    if settings.uses_supabase_storage:
        local_path = _local_path_for_key(key)
        try:
            bucket = settings.supabase_storage_bucket
            path = quote(key, safe="/")
            r = _supabase_client().get(f"/storage/v1/object/{bucket}/{path}")
            if r.status_code == 200:
                return r.content
        except (RuntimeError, httpx.HTTPError):
            if local_path.is_file():
                return local_path.read_bytes()
            raise
        if local_path.is_file():
            return local_path.read_bytes()
        r.raise_for_status()
    path = _local_path_for_key(key)
    return path.read_bytes()


def exists(key: str) -> bool:
    key = _normalize_key(key)
    if settings.uses_supabase_storage:
        try:
            bucket = settings.supabase_storage_bucket
            path = quote(key, safe="/")
            r = _supabase_client().get(f"/storage/v1/object/{bucket}/{path}")
            if r.status_code == 200:
                return True
        except (RuntimeError, httpx.HTTPError):
            pass
        return _local_path_for_key(key).is_file()
    return _local_path_for_key(key).is_file()


def delete_key(key: str) -> None:
    key = _normalize_key(key)
    if settings.uses_supabase_storage:
        local_path = _local_path_for_key(key)
        bucket = settings.supabase_storage_bucket
        r = _supabase_client().request(
            "DELETE",
            f"/storage/v1/object/{bucket}",
            json={"prefixes": [key]},
        )
        if r.status_code not in (200, 204, 404) and not local_path.exists():
            r.raise_for_status()
        if local_path.exists():
            local_path.unlink()
        return
    path = _local_path_for_key(key)
    if path.exists():
        path.unlink()


def delete_prefix(prefix: str) -> None:
    """Delete all objects under a key prefix (local dir tree or best-effort list on Supabase)."""
    prefix = _normalize_key(prefix)
    local_path = _local_path_for_key(prefix)
    if settings.uses_supabase_storage:
        bucket = settings.supabase_storage_bucket
        client = _supabase_client()
        list_r = client.post(
            f"/storage/v1/object/list/{bucket}",
            json={"prefix": prefix, "limit": 1000},
        )
        if list_r.status_code == 404:
            if local_path.is_dir():
                shutil.rmtree(local_path)
            return
        list_r.raise_for_status()
        names = [item["name"] for item in list_r.json() if item.get("name")]
        if not names:
            if local_path.is_dir():
                shutil.rmtree(local_path)
            return
        paths = [quote(f"{prefix}/{n}" if prefix else n, safe="/") for n in names]
        del_r = client.request(
            "DELETE",
            f"/storage/v1/object/{bucket}",
            json={"prefixes": paths},
        )
        if del_r.status_code not in (200, 204):
            del_r.raise_for_status()
        if local_path.is_dir():
            shutil.rmtree(local_path)
        return
    if local_path.is_dir():
        shutil.rmtree(local_path)
    elif prefix.startswith("files/"):
        alt = Path(settings.files_root) / prefix[len("files/") :]
        if alt.is_dir():
            shutil.rmtree(alt)


def open_local_path(key: str) -> Optional[Path]:
    """Return local Path when present, including fallback files in Supabase mode."""
    path = _local_path_for_key(key)
    return path if path.is_file() else None


def stream_bytes(key: str) -> io.BytesIO:
    return io.BytesIO(read_bytes(key))
