from __future__ import annotations

from typing import Any


def search_points(
    client: Any,
    collection_name: str,
    query_vector: list[float],
    limit: int,
    score_threshold: float | None,
) -> list[Any]:
    """Query Qdrant with the supported query_points(query=...) API and return points."""
    if not query_vector:
        raise ValueError("query_vector must not be empty")
    if limit <= 0:
        raise ValueError("limit must be greater than zero")
    response = client.query_points(
        collection_name=collection_name,
        query=query_vector,
        limit=limit,
        score_threshold=score_threshold,
        with_payload=True,
    )
    return response.points
