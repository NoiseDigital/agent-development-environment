"""HTTP API for data sources.

Two kinds of source feed the analysis workflow:

  - Uploads     — files the user uploads; the platform stores and tracks them,
                  so they are persisted in the `sources` table.
  - BigQuery    — tables that already live in BigQuery (the system of record).
                  These are browsed and referenced live, never registered.

Endpoints under /api/sources manage uploads; endpoints under /api/bigquery
expose the BigQuery catalog for live selection.
"""

from __future__ import annotations

import csv
import io
import os

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from api.auth import CurrentUser, current_user

from . import repo
from .storage import get_storage

router = APIRouter(prefix="/api", tags=["sources"])

ALLOWED_EXTS = {".csv", ".txt", ".xlsx", ".xls", ".xlsb"}
MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB


def _inspect(data: bytes, ext: str) -> dict:
    """Cheap schema peek so the source picker can show columns/sheets without analysis."""
    meta: dict = {}
    try:
        if ext in (".csv", ".txt"):
            text = data.decode("utf-8", errors="replace")
            header = next(csv.reader(io.StringIO(text)), [])
            meta["columns"] = [h.strip() for h in header]
        elif ext == ".xlsx":
            import openpyxl

            wb = openpyxl.load_workbook(
                io.BytesIO(data), read_only=True, data_only=True
            )
            sheets: dict[str, list[str]] = {}
            for ws in wb.worksheets:
                first = next(ws.iter_rows(max_row=1, values_only=True), ())
                sheets[ws.title] = [str(c).strip() for c in first if c is not None]
            wb.close()
            meta["sheet_names"] = list(sheets.keys())
            meta["sheets"] = sheets
    except Exception as e:  # noqa: BLE001 — inspection is best-effort, never fail the upload
        meta["inspect_error"] = str(e)
    return meta


# ── Uploads ────────────────────────────────────────────────────────────────


@router.get("/sources")
async def list_uploads(user: CurrentUser = Depends(current_user)):
    return {"sources": await repo.list_uploads(user.uid)}


@router.get("/sources/{source_id}")
async def get_upload(source_id: str):
    source = await repo.get_upload(source_id)
    if not source:
        raise HTTPException(404, "Source not found.")
    return source


@router.post("/sources/upload")
async def upload_source(
    file: UploadFile = File(...),
    user: CurrentUser = Depends(current_user),
):
    filename = file.filename or "upload"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(
            400, f"Unsupported file type '{ext}'. Allowed: {sorted(ALLOWED_EXTS)}"
        )
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            413, f"File too large (max {MAX_UPLOAD_BYTES // (1024 * 1024)} MB)."
        )

    storage = get_storage()
    key = storage.save(data, filename)
    metadata = _inspect(data, ext)
    return await repo.create_upload(
        user_id=user.uid,
        name=filename,
        storage_key=key,
        file_ext=ext,
        size_bytes=len(data),
        metadata=metadata,
    )


@router.delete("/sources/{source_id}")
async def delete_upload(source_id: str):
    source = await repo.get_upload(source_id)
    if not source:
        raise HTTPException(404, "Source not found.")
    if source.get("storage_key"):
        try:
            get_storage().delete(source["storage_key"])
        except Exception:  # noqa: BLE001 — DB row removal is what matters
            pass
    await repo.delete_upload(source_id)
    return {"deleted": source_id}


# ── BigQuery catalog (browsed and referenced live, never registered) ────────


def _bq_client():
    from google.cloud import bigquery

    return bigquery.Client(project=os.environ.get("GOOGLE_CLOUD_PROJECT"))


@router.get("/bigquery/datasets")
async def list_bq_datasets():
    try:
        client = _bq_client()
        return {"datasets": [d.dataset_id for d in client.list_datasets()]}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"BigQuery error: {e}")


@router.get("/bigquery/tables")
async def list_bq_tables(dataset: str):
    try:
        client = _bq_client()
        tables = client.list_tables(dataset)
        return {"tables": [{"dataset": dataset, "table": t.table_id} for t in tables]}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"BigQuery error: {e}")
