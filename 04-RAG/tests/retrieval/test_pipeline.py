from types import SimpleNamespace

from priora_rag.retrieval import pipeline


def test_retrieval_pipeline_embeds_searches_and_maps(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    point = SimpleNamespace(
        payload={
            "active": True,
            "approved": True,
            "environment": "test",
            "schema_version": 2,
        }
    )
    monkeypatch.setattr(pipeline, "QDRANT_URL", ":memory:")
    monkeypatch.setattr(pipeline, "QDRANT_COLLECTION", "test")
    monkeypatch.setattr(pipeline, "EMBEDDING_MODEL", "model")
    monkeypatch.setattr(pipeline, "ENVIRONMENT", "test")
    monkeypatch.setattr(pipeline, "embed_query", lambda query, model: [1.0])
    monkeypatch.setattr(pipeline, "create_qdrant_client", lambda *args: "client")

    def search(client, collection, vector, limit, threshold):  # type: ignore[no-untyped-def]
        assert (client, collection, vector, limit, threshold) == ("client", "test", [1.0], 30, 0.4)
        return [point]

    monkeypatch.setattr(pipeline, "search_points", search)
    monkeypatch.setattr(pipeline, "map_search_results", lambda points: [{"chunk_id": "id"}])
    assert pipeline.retrieve("question") == [{"chunk_id": "id"}]
