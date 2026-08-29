from types import SimpleNamespace

import pytest
from qdrant_client.models import Distance, VectorParams

from priora_rag.vector_store.collection import ensure_collection


class ClientStub:
    def __init__(self, size: int | None = None) -> None:
        self.size = size
        self.created = False

    def get_collections(self):  # type: ignore[no-untyped-def]
        names = [] if self.size is None else [SimpleNamespace(name="test")]
        return SimpleNamespace(collections=names)

    def create_collection(self, **kwargs):  # type: ignore[no-untyped-def]
        self.created = True

    def get_collection(self, name):  # type: ignore[no-untyped-def]
        vectors = VectorParams(size=self.size, distance=Distance.COSINE)
        return SimpleNamespace(config=SimpleNamespace(params=SimpleNamespace(vectors=vectors)))


def test_creates_missing_and_validates_existing_dimension() -> None:
    missing = ClientStub()
    ensure_collection(missing, "test", 2)
    assert missing.created is True
    with pytest.raises(ValueError, match="dimension"):
        ensure_collection(ClientStub(3), "test", 2)
