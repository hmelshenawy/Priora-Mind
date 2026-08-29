import pytest

from priora_rag.ingestion.text_chunker import CHUNK_KEYS, create_chunks


def test_chunks_are_canonical_deterministic_and_preserve_page_ranges() -> None:
    pages = [
        {"page_number": 1, "text": "Evidence supported the prediction."},
        {"page_number": 2, "text": "Evidence weakened the prediction."},
    ]
    first = create_chunks(pages, "source", "Source", "source.pdf", 200, 20)
    second = create_chunks(pages, "source", "Source", "source.pdf", 200, 20)

    assert first == second
    assert set(first[0]) == set(CHUNK_KEYS)
    assert first[0]["page_number"] == 1
    assert first[0]["page_start"] == 1
    assert first[0]["page_end"] == 2
    assert str(first[0]["text_hash"]).startswith("sha256:")


def test_chunk_boundaries_do_not_start_or_end_inside_words() -> None:
    chunks = create_chunks(
        [{"page_number": 1, "text": "alpha beta gamma delta epsilon zeta eta theta"}],
        "source", "Source", "source.pdf", 20, 5,
    )
    assert len(chunks) > 1
    assert all(str(chunk["text"])[0].isalnum() for chunk in chunks)
    assert all(str(chunk["text"])[-1].isalnum() for chunk in chunks)


@pytest.mark.parametrize("size,overlap", [(0, 0), (10, -1), (10, 10)])
def test_rejects_invalid_chunk_settings(size: int, overlap: int) -> None:
    with pytest.raises(ValueError):
        create_chunks([{"page_number": 1, "text": "text"}], "s", "S", "s.pdf", size, overlap)
