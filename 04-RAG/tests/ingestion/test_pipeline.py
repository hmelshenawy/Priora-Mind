from pathlib import Path

from qdrant_client.models import PointStruct

from priora_rag.ingestion import pipeline


def test_pipeline_orders_steps_and_passes_chunk_dicts_to_mapper(monkeypatch, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    calls: list[str] = []
    source = tmp_path / "source.pdf"
    source.write_bytes(b"pdf")
    chunk = {"chunk_id": "id", "text": "text"}
    point = PointStruct(id=1, vector=[1.0, 0.0], payload={})
    monkeypatch.setattr(pipeline, "QDRANT_URL", ":memory:")
    monkeypatch.setattr(pipeline, "EMBEDDING_DIMENSION", 2)
    monkeypatch.setattr(pipeline, "read_pdf_pages", lambda *args: calls.append("read") or [{"page_number": 1, "text": "raw"}])
    monkeypatch.setattr(pipeline, "clean_pages", lambda pages: calls.append("clean") or pages)
    monkeypatch.setattr(pipeline, "create_chunks", lambda *args: calls.append("chunk") or [chunk])
    monkeypatch.setattr(pipeline, "write_chunks_jsonl", lambda *args: calls.append("write") or "chunks.jsonl")
    monkeypatch.setattr(pipeline, "embed_texts", lambda *args: calls.append("embed") or [[1.0, 0.0]])
    monkeypatch.setattr(pipeline, "create_qdrant_client", lambda *args: calls.append("client") or object())
    monkeypatch.setattr(pipeline, "ensure_collection", lambda *args: calls.append("collection"))

    def mapper(chunks, *args):  # type: ignore[no-untyped-def]
        calls.append("map")
        assert chunks == [chunk]
        assert isinstance(chunks[0], dict)
        return [point]

    def upsert(client, collection, points, batch_size):  # type: ignore[no-untyped-def]
        calls.append("upsert")
        assert all(isinstance(value, PointStruct) for value in points)
        return len(points)

    monkeypatch.setattr(pipeline, "map_chunks_to_points", mapper)
    monkeypatch.setattr(pipeline, "upsert_points", upsert)
    result = pipeline.ingest_document(str(source))

    assert calls == ["read", "clean", "chunk", "write", "embed", "client", "collection", "map", "upsert"]
    assert result["generated_chunk_count"] == 1
    assert result["upserted_point_count"] == 1
    assert result["completion_status"] == "completed"
