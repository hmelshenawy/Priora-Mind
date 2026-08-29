from qdrant_client import QdrantClient

from priora_rag.ingestion.text_chunker import create_chunks
from priora_rag.vector_store.collection import ensure_collection
from priora_rag.vector_store.point_mapper import map_chunks_to_points
from priora_rag.vector_store.upsert import upsert_points


def test_repeated_chunks_and_point_ids_update_without_duplicates() -> None:
    pages = [{"page_number": 1, "text": "Stable source text."}]
    first = create_chunks(pages, "source", "Source", "source.pdf", 100, 10)
    second = create_chunks(pages, "source", "Source", "source.pdf", 100, 10)
    first_points = map_chunks_to_points(first, [[1.0, 0.0]], "model", 2, "test")
    second_points = map_chunks_to_points(second, [[1.0, 0.0]], "model", 2, "test")
    client = QdrantClient(location=":memory:")
    ensure_collection(client, "test", 2)
    upsert_points(client, "test", first_points, 2)
    upsert_points(client, "test", second_points, 2)

    assert [chunk["chunk_id"] for chunk in first] == [chunk["chunk_id"] for chunk in second]
    assert [point.id for point in first_points] == [point.id for point in second_points]
    assert client.count("test", exact=True).count == 1
