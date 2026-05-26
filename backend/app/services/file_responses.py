"""Helpers to serve stored files via FastAPI."""

from __future__ import annotations

from urllib.parse import quote

from fastapi import HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from starlette.responses import Response

from app.services import blob_storage


def serve_blob(
    key: str,
    *,
    media_type: str,
    filename: str,
    download: bool = False,
) -> Response:
    if not blob_storage.exists(key):
        raise HTTPException(status_code=404, detail="File not found")

    local_path = blob_storage.open_local_path(key)
    disposition = "attachment" if download else "inline"
    if filename.isascii():
        content_disposition = f'{disposition}; filename="{filename}"'
    else:
        ascii_fallback = (
            filename.encode("ascii", "ignore").decode("ascii") or "document"
        )
        encoded = quote(filename, safe="")
        content_disposition = (
            f"{disposition}; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded}"
        )
    headers = {"Content-Disposition": content_disposition}

    if local_path is not None:
        return FileResponse(local_path, media_type=media_type, headers=headers)

    data = blob_storage.read_bytes(key)
    return StreamingResponse(
        iter([data]),
        media_type=media_type,
        headers=headers,
    )


def serve_storage_path(
    relative_path: str,
    *,
    media_type: str,
    filename: str,
    download: bool = False,
    app_document: bool = False,
) -> Response:
    key = (
        blob_storage.key_for_app_document(relative_path)
        if app_document
        else blob_storage.key_for_upload(relative_path)
    )
    return serve_blob(key, media_type=media_type, filename=filename, download=download)
