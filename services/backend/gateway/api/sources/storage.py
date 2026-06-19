"""File storage abstraction for uploaded data sources.

Local filesystem in development; the Storage interface is designed so a GCS
backend can be dropped in for deployed environments without touching callers.
"""

from __future__ import annotations

import os
import uuid
from abc import ABC, abstractmethod
from pathlib import Path


class Storage(ABC):
    @abstractmethod
    def save(self, data: bytes, filename: str) -> str:
        """Persist bytes and return an opaque storage key."""

    @abstractmethod
    def read_bytes(self, key: str) -> bytes:
        """Read raw bytes back for a stored key."""

    @abstractmethod
    def delete(self, key: str) -> None:
        """Remove a stored object (no-op if missing)."""

    @abstractmethod
    def exists(self, key: str) -> bool: ...

    @abstractmethod
    def resolve_uri(self, key: str) -> str:
        """A locator a pandas/BigQuery reader can consume (fs path or gs:// URI)."""


class LocalStorage(Storage):
    """Stores files under a root directory — a Docker volume shared with the MCP server."""

    def __init__(self, root: str):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _full(self, key: str) -> Path:
        # Resolve and guard against path traversal in the key.
        p = (self.root / key).resolve()
        if not str(p).startswith(str(self.root.resolve())):
            raise ValueError("Invalid storage key")
        return p

    def save(self, data: bytes, filename: str) -> str:
        safe_name = os.path.basename(filename) or "upload"
        key = f"{uuid.uuid4().hex}/{safe_name}"
        dest = self._full(key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return key

    def read_bytes(self, key: str) -> bytes:
        return self._full(key).read_bytes()

    def delete(self, key: str) -> None:
        p = self._full(key)
        if p.exists():
            p.unlink()
            # Remove the now-empty unique parent directory.
            try:
                p.parent.rmdir()
            except OSError:
                pass

    def exists(self, key: str) -> bool:
        return self._full(key).exists()

    def resolve_uri(self, key: str) -> str:
        return str(self._full(key))


class GcsStorage(Storage):
    """Stores files in a GCS bucket — the deployed backend. Auth via ADC (the
    Cloud Run runtime service account, which has objectAdmin on the bucket)."""

    def __init__(self, bucket: str):
        from google.cloud import storage as gcs

        self._bucket_name = bucket
        self._bucket = gcs.Client().bucket(bucket)

    def save(self, data: bytes, filename: str) -> str:
        safe_name = os.path.basename(filename) or "upload"
        key = f"{uuid.uuid4().hex}/{safe_name}"
        self._bucket.blob(key).upload_from_string(data)
        return key

    def read_bytes(self, key: str) -> bytes:
        return self._bucket.blob(key).download_as_bytes()

    def delete(self, key: str) -> None:
        from google.api_core.exceptions import NotFound

        try:
            self._bucket.blob(key).delete()
        except NotFound:
            pass  # already gone — match LocalStorage's no-op semantics

    def exists(self, key: str) -> bool:
        return self._bucket.blob(key).exists()

    def resolve_uri(self, key: str) -> str:
        # gs:// URI a pandas/BigQuery reader (with gcsfs) can consume directly.
        return f"gs://{self._bucket_name}/{key}"


def get_storage() -> Storage:
    backend = os.environ.get("STORAGE_BACKEND", "local").lower()
    if backend == "gcs":
        bucket = os.environ.get("GCS_BUCKET")
        if not bucket:
            raise RuntimeError("STORAGE_BACKEND=gcs requires GCS_BUCKET")
        return GcsStorage(bucket)
    return LocalStorage(os.environ.get("STORAGE_LOCAL_PATH", "/data/uploads"))
