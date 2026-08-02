import pytest

from priora_rag.embeddings import embedder


class ModelStub:
    def encode(self, texts, **kwargs):  # type: ignore[no-untyped-def]
        return [[1.0, 0.0] for _ in texts]


def test_embeds_texts_and_query(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(embedder, "load_embedding_model", lambda name: ModelStub())
    assert embedder.embed_texts(["stress"], "model", 8) == [[1.0, 0.0]]
    assert embedder.embed_query("stress", "model") == [1.0, 0.0]


def test_rejects_empty_text() -> None:
    with pytest.raises(ValueError, match="non-empty"):
        embedder.embed_texts([""], "model", 8)
