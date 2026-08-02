from types import SimpleNamespace

from priora_rag.vector_store.search import search_points


class ClientStub:
    def __init__(self) -> None:
        self.kwargs: dict[str, object] = {}

    def query_points(self, **kwargs: object):  # type: ignore[no-untyped-def]
        self.kwargs = kwargs
        return SimpleNamespace(points=["point"])


def test_uses_query_points_query_and_returns_response_points() -> None:
    client = ClientStub()
    assert search_points(client, "collection", [1.0], 3, 0.6) == ["point"]
    assert client.kwargs == {
        "collection_name": "collection", "query": [1.0], "limit": 3,
        "score_threshold": 0.6, "with_payload": True,
    }
    assert not hasattr(client, "search")
