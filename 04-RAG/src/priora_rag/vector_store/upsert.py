from __future__ import annotations

from typing import Any


def upsert_points(
    client: Any,
    collection_name: str,
    points: list[Any],
    batch_size: int = 50,
) -> int:
    """Upsert pre-mapped PointStruct values in small, sequential batches."""
    from qdrant_client.models import PointStruct

    if batch_size <= 0:
        raise ValueError("batch_size must be greater than zero")
    if any(not isinstance(point, PointStruct) for point in points):
        raise ValueError("upsert_points accepts PointStruct objects only")
    total = len(points)
    for start in range(0, total, batch_size):
        batch = points[start : start + batch_size]
        client.upsert(collection_name=collection_name, points=batch, wait=True)
        print(f"Qdrant upsert: {start + len(batch)}/{total}")
    return total
