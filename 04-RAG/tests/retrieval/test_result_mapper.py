from types import SimpleNamespace

import pytest

from priora_rag.retrieval.result_mapper import map_scored_point


def payload() -> dict[str, object]:
    return {
        "chunk_id": "id", "text": "text", "source_id": "source",
        "source_title": "Source", "source_file": "source.pdf", "source_type": "pdf",
        "chunk_index": 0, "page_number": 1, "page_start": 1, "page_end": 2,
        "citation_page": 1, "citation_heading": None, "citation_section": None,
        "text_hash": "sha256:text",
    }


def test_maps_result_and_preserves_page_metadata() -> None:
    result = map_scored_point(SimpleNamespace(payload=payload(), score=0.61))
    assert result["score"] == 0.61
    assert (result["page_number"], result["page_start"], result["page_end"]) == (1, 1, 2)


def test_rejects_legacy_payload() -> None:
    legacy = payload()
    del legacy["source_file"]
    with pytest.raises(ValueError, match="re-ingest"):
        map_scored_point(SimpleNamespace(payload=legacy, score=0.5))
