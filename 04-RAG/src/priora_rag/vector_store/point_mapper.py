from __future__ import annotations

from typing import Any


REQUIRED_CHUNK_FIELDS = (
    "chunk_id",
    "source_id",
    "source_title",
    "source_file",
    "source_type",
    "chunk_index",
    "text",
    "page_number",
    "page_start",
    "page_end",
    "heading",
    "section",
    "text_hash",
)


def validate_chunk(chunk: dict[str, object]) -> None:
    """Validate the canonical chunk dictionary and name every invalid field clearly."""
    if not isinstance(chunk, dict):
        raise ValueError("chunk must be a dictionary")
    for field in REQUIRED_CHUNK_FIELDS:
        if field not in chunk:
            raise ValueError(f"chunk is missing required field '{field}'")
    for field in ("chunk_id", "source_id", "source_title", "source_file", "text", "text_hash"):
        if not isinstance(chunk[field], str) or not chunk[field].strip():
            raise ValueError(f"chunk field '{field}' must not be empty")
    if chunk["source_type"] != "pdf":
        raise ValueError("chunk field 'source_type' must be 'pdf'")
    if not isinstance(chunk["chunk_index"], int) or chunk["chunk_index"] < 0:
        raise ValueError("chunk field 'chunk_index' must be a non-negative integer")
    for field in ("page_number", "page_start", "page_end"):
        if not isinstance(chunk[field], int) or chunk[field] < 1:
            raise ValueError(f"chunk field '{field}' must be a positive integer")
    if chunk["page_number"] != chunk["page_start"]:
        raise ValueError("chunk field 'page_number' must equal 'page_start'")
    if chunk["page_end"] < chunk["page_start"]:
        raise ValueError("chunk field 'page_end' must be >= 'page_start'")
    for field in ("heading", "section"):
        if chunk[field] is not None and not isinstance(chunk[field], str):
            raise ValueError(f"chunk field '{field}' must be a string or None")


def map_chunks_to_points(
    chunks: list[dict[str, object]],
    vectors: list[list[float]],
    embedding_model: str,
    embedding_dimension: int,
    environment: str,
) -> list[Any]:
    """Map canonical chunks and same-length vectors to deterministic PointStruct values."""
    from qdrant_client.models import PointStruct

    if len(chunks) != len(vectors):
        raise ValueError("chunks and vectors must have the same length")
    points: list[Any] = []
    for index, (chunk, vector) in enumerate(zip(chunks, vectors, strict=True)):
        validate_chunk(chunk)
        if len(vector) != embedding_dimension:
            raise ValueError(
                f"vector at index {index} has dimension {len(vector)}, "
                f"expected {embedding_dimension}"
            )
        payload = dict(chunk)
        payload.update(
            {
                "citation_page": chunk["page_number"],
                "citation_heading": chunk["heading"],
                "citation_section": chunk["section"],
                "active": True,
                "approved": True,
                "embedding_model": embedding_model,
                "embedding_dimension": embedding_dimension,
                "environment": environment,
                "schema_version": 2,
            }
        )
        points.append(PointStruct(id=chunk["chunk_id"], vector=vector, payload=payload))
    return points
