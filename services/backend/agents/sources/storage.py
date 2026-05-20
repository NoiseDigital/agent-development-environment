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


# GCS backend — implement when deploying:
#
# class GcsStorage(Storage):
#     def __init__(self, bucket: str): ...
#     def resolve_uri(self, key): return f"gs://{self.bucket}/{key}"
#
# Switch via STORAGE_BACKEND=gcs + GCS_BUCKET. Callers stay unchanged.


def get_storage() -> Storage:
    backend = os.environ.get("STORAGE_BACKEND", "local").lower()
    if backend == "gcs":
        raise NotImplementedError(
            "GCS storage backend is not implemented yet. Use STORAGE_BACKEND=local."
        )
    return LocalStorage(os.environ.get("STORAGE_LOCAL_PATH", "/data/uploads"))
