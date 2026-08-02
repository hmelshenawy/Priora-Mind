from __future__ import annotations

from typing import Any


def create_qdrant_client(url: str, api_key: str | None, timeout: int) -> Any:
    """Create a Qdrant client without performing collection or point operations."""
    if not isinstance(url, str) or not url.strip():
        raise ValueError("QDRANT_URL is required")
    if timeout <= 0:
        raise ValueError("Qdrant timeout must be greater than zero")
    from qdrant_client import QdrantClient

    if url == ":memory:":
        return QdrantClient(location=":memory:")
    return QdrantClient(url=url, api_key=api_key, timeout=timeout)
