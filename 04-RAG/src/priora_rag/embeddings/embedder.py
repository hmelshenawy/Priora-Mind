from __future__ import annotations

from functools import lru_cache


@lru_cache(maxsize=2)
def load_embedding_model(model_name: str):
    """Load and cache one sentence-transformer model per model name."""
    if not isinstance(model_name, str) or not model_name.strip():
        raise ValueError("model_name must not be empty")
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(model_name)


def embed_texts(
    texts: list[str],
    model_name: str,
    batch_size: int,
) -> list[list[float]]:
    """Embed non-empty strings and return normalized vectors as Python lists."""
    if batch_size <= 0:
        raise ValueError("batch_size must be greater than zero")
    for index, text in enumerate(texts):
        if not isinstance(text, str) or not text.strip():
            raise ValueError(f"texts[{index}] must be a non-empty string")
    if not texts:
        return []
    encoded = load_embedding_model(model_name).encode(
        texts,
        batch_size=batch_size,
        show_progress_bar=True,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )
    vectors = encoded.tolist() if hasattr(encoded, "tolist") else encoded
    return [[float(value) for value in vector] for vector in vectors]


def embed_query(query: str, model_name: str) -> list[float]:
    """Embed one validated retrieval query."""
    if not isinstance(query, str) or not query.strip():
        raise ValueError("query must be a non-empty string")
    return embed_texts([query.strip()], model_name, batch_size=1)[0]
