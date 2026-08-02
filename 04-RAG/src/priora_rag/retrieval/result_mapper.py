from __future__ import annotations

from typing import Any


RESULT_FIELDS = (
    "chunk_id", "text", "source_id", "source_title", "source_file", "source_type",
    "chunk_index", "page_number", "page_start", "page_end", "citation_page",
    "citation_heading", "citation_section", "text_hash",
)


def map_scored_point(point: Any) -> dict[str, object]:
    """Convert one Qdrant scored point to the explicit retrieval result contract."""
    payload = point.payload
    if not isinstance(payload, dict):
        raise ValueError("stored point has no payload; re-ingest the document")
    for field in RESULT_FIELDS:
        if field not in payload:
            raise ValueError(
                f"stored point is missing required field '{field}'; "
                "re-ingest the document after the metadata schema update"
            )
    for field in ("chunk_id", "text", "source_id", "source_title", "source_file", "text_hash"):
        if not isinstance(payload[field], str) or not payload[field].strip():
            raise ValueError(
                f"stored point has invalid field '{field}'; "
                "re-ingest the document after the metadata schema update"
            )
    if payload["source_type"] != "pdf":
        raise ValueError("stored point has invalid field 'source_type'; re-ingest the document")
    for field in ("chunk_index", "page_number", "page_start", "page_end", "citation_page"):
        minimum = 0 if field == "chunk_index" else 1
        if not isinstance(payload[field], int) or payload[field] < minimum:
            raise ValueError(f"stored point has invalid field '{field}'; re-ingest the document")
    return {
        "chunk_id": payload["chunk_id"], "score": float(point.score), "text": payload["text"],
        "source_id": payload["source_id"], "source_title": payload["source_title"],
        "source_file": payload["source_file"], "source_type": payload["source_type"],
        "chunk_index": payload["chunk_index"], "page_number": payload["page_number"],
        "page_start": payload["page_start"], "page_end": payload["page_end"],
        "citation_page": payload["citation_page"],
        "citation_heading": payload["citation_heading"],
        "citation_section": payload["citation_section"], "text_hash": payload["text_hash"],
    }


def map_search_results(points: list[Any]) -> list[dict[str, object]]:
    """Map Qdrant scored points without silently filling missing metadata."""
    return [map_scored_point(point) for point in points]
