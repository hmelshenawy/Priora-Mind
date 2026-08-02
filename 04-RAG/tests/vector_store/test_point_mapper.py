import pytest

from priora_rag.vector_store.point_mapper import map_chunks_to_points


def chunk() -> dict[str, object]:
    return {
        "chunk_id": "458345b2-2c1e-5d78-a375-e08eab0e7953",
        "source_id": "source", "source_title": "Source", "source_file": "source.pdf",
        "source_type": "pdf", "chunk_index": 0, "text": "Useful evidence.",
        "page_number": 2, "page_start": 2, "page_end": 3,
        "heading": None, "section": None, "text_hash": "sha256:text",
    }


def test_maps_all_payload_and_citation_fields() -> None:
    point = map_chunks_to_points([chunk()], [[1.0, 0.0]], "model", 2, "test")[0]
    assert point.id == "458345b2-2c1e-5d78-a375-e08eab0e7953"
    assert point.payload["citation_page"] == 2
    assert point.payload["citation_heading"] is None
    assert point.payload["citation_section"] is None
    assert point.payload["environment"] == "test"
    assert point.payload["schema_version"] == 2
    assert point.payload["active"] is True


def test_rejects_missing_field_count_mismatch_and_bad_dimension() -> None:
    invalid = chunk()
    del invalid["source_title"]
    with pytest.raises(ValueError, match="source_title"):
        map_chunks_to_points([invalid], [[1.0, 0.0]], "model", 2, "test")
    with pytest.raises(ValueError, match="same length"):
        map_chunks_to_points([chunk()], [], "model", 2, "test")
    with pytest.raises(ValueError, match="dimension"):
        map_chunks_to_points([chunk()], [[1.0]], "model", 2, "test")
