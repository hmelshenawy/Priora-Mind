from __future__ import annotations

from typing import Any


def ensure_collection(
    client: Any,
    collection_name: str,
    embedding_dimension: int,
) -> None:
    """Create a cosine collection or validate an existing collection's vector contract."""
    from qdrant_client.models import Distance, VectorParams

    collections = client.get_collections()
    names = {collection.name for collection in collections.collections}
    if collection_name not in names:
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=embedding_dimension, distance=Distance.COSINE),
        )
        return

    vectors = client.get_collection(collection_name).config.params.vectors
    vector_config = vectors.get("") if isinstance(vectors, dict) else vectors
    if vector_config is None:
        raise ValueError(f"Qdrant collection '{collection_name}' has no default vector")
    if vector_config.size != embedding_dimension:
        raise ValueError(
            f"Qdrant collection '{collection_name}' vector dimension is "
            f"{vector_config.size}, expected {embedding_dimension}"
        )
    if vector_config.distance != Distance.COSINE:
        raise ValueError(
            f"Qdrant collection '{collection_name}' distance is "
            f"{vector_config.distance}, expected Cosine"
        )
