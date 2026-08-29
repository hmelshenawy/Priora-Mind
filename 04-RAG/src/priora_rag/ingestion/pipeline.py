from __future__ import annotations

from pathlib import Path

from priora_rag.config import (
    CHUNK_OVERLAP,
    CHUNK_SIZE,
    EMBEDDING_BATCH_SIZE,
    EMBEDDING_DIMENSION,
    EMBEDDING_MODEL,
    ENVIRONMENT,
    MAX_SOURCE_BYTES,
    QDRANT_API_KEY,
    QDRANT_COLLECTION,
    QDRANT_TIMEOUT,
    QDRANT_UPSERT_BATCH_SIZE,
    QDRANT_URL,
)
from priora_rag.embeddings.embedder import embed_texts
from priora_rag.vector_store.client import create_qdrant_client
from priora_rag.vector_store.collection import ensure_collection
from priora_rag.vector_store.point_mapper import map_chunks_to_points
from priora_rag.vector_store.upsert import upsert_points

from .chunk_writer import write_chunks_jsonl
from .pdf_reader import read_pdf_pages
from .text_chunker import create_chunks
from .text_cleaner import clean_pages


def ingest_document(
    file_path: str,
    *,
    chunk_size: int | None = None,
    chunk_overlap: int | None = None,
) -> dict[str, object]:
    """Coordinate PDF-to-Qdrant ingestion and return a plain result dictionary."""
    if not QDRANT_URL:
        raise ValueError("QDRANT_URL is required")
    path = Path(file_path)
    source_id = path.stem.strip()
    source_title = path.stem.strip()
    source_file = path.name
    if not source_id:
        raise ValueError("source_id derived from file name must not be empty")

    pages = read_pdf_pages(str(path), MAX_SOURCE_BYTES)
    cleaned_pages = clean_pages(pages)
    chunks = create_chunks(
        cleaned_pages,
        source_id,
        source_title,
        source_file,
        CHUNK_SIZE if chunk_size is None else chunk_size,
        CHUNK_OVERLAP if chunk_overlap is None else chunk_overlap,
    )
    if not chunks:
        raise ValueError("source contains no readable text")
    chunks_output_path = write_chunks_jsonl(
        chunks, str(path.with_name(f"{path.stem}_chunks.jsonl"))
    )
    vectors = embed_texts(
        [str(chunk["text"]) for chunk in chunks],
        EMBEDDING_MODEL,
        EMBEDDING_BATCH_SIZE,
    )
    client = create_qdrant_client(
        QDRANT_URL,
        QDRANT_API_KEY,
        QDRANT_TIMEOUT,
    )
    ensure_collection(client, QDRANT_COLLECTION, EMBEDDING_DIMENSION)
    points = map_chunks_to_points(
        chunks,
        vectors,
        EMBEDDING_MODEL,
        EMBEDDING_DIMENSION,
        ENVIRONMENT,
    )
    upserted_count = upsert_points(
        client,
        QDRANT_COLLECTION,
        points,
        QDRANT_UPSERT_BATCH_SIZE,
    )
    return {
        "source_id": source_id,
        "source_title": source_title,
        "source_file": source_file,
        "chunks_output_path": chunks_output_path,
        "generated_chunk_count": len(chunks),
        "upserted_point_count": upserted_count,
        "completion_status": "completed",
    }
