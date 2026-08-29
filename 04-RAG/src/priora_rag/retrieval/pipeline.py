from __future__ import annotations

from typing import Any

from priora_rag.config import (
    EMBEDDING_MODEL,
    ENVIRONMENT,
    QDRANT_API_KEY,
    QDRANT_COLLECTION,
    QDRANT_TIMEOUT,
    QDRANT_URL,
    RETRIEVAL_LIMIT,
    SCORE_THRESHOLD,
)
from priora_rag.embeddings.embedder import embed_query
from priora_rag.vector_store.client import create_qdrant_client
from priora_rag.vector_store.search import search_points

from .result_mapper import map_search_results


def retrieve(
    query: str,
    *,
    limit: int | None = None,
    score_threshold: float | None = None,
) -> list[dict[str, object]]:
    """Coordinate query embedding, Qdrant search, and strict result mapping."""
    if not isinstance(query, str) or not query.strip():
        raise ValueError("query must be a non-empty string")
    if not QDRANT_URL:
        raise ValueError("QDRANT_URL is required")
    result_limit = RETRIEVAL_LIMIT if limit is None else limit
    if result_limit <= 0:
        raise ValueError("limit must be greater than zero")
    threshold = SCORE_THRESHOLD if score_threshold is None else score_threshold
    query_vector = embed_query(query.strip(), EMBEDDING_MODEL)
    client = create_qdrant_client(
        QDRANT_URL,
        QDRANT_API_KEY,
        QDRANT_TIMEOUT,
    )
    candidates = search_points(
        client, QDRANT_COLLECTION, query_vector,
        max(result_limit * 10, result_limit), threshold,
    )
    current_points = [point for point in candidates if _belongs_to_current_schema(point)]
    return map_search_results(current_points[:result_limit])


def _belongs_to_current_schema(point: Any) -> bool:
    payload = point.payload
    return (
        isinstance(payload, dict)
        and payload.get("active") is True
        and payload.get("approved") is True
        and payload.get("environment") == ENVIRONMENT
        and payload.get("schema_version") == 2
    )
