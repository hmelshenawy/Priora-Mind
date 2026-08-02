from qdrant_client.models import PointStruct

from priora_rag.vector_store.upsert import upsert_points


class ClientStub:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    def upsert(self, **kwargs: object) -> None:
        self.calls.append(kwargs)


def test_upserts_explicit_points_in_batches_with_wait() -> None:
    client = ClientStub()
    points = [PointStruct(id=index, vector=[1.0], payload={}) for index in range(5)]
    assert upsert_points(client, "collection", points, batch_size=2) == 5
    assert [len(call["points"]) for call in client.calls] == [2, 2, 1]  # type: ignore[arg-type]
    assert all(call["wait"] is True for call in client.calls)


def test_empty_upsert_is_safe() -> None:
    client = ClientStub()
    assert upsert_points(client, "collection", [], batch_size=2) == 0
    assert client.calls == []
