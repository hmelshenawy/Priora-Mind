from __future__ import annotations

from fastapi import FastAPI, Header, HTTPException, Request

from .config import (
    EMBEDDING_DIMENSION,
    EMBEDDING_MODEL,
    QDRANT_API_KEY,
    QDRANT_COLLECTION,
    QDRANT_TIMEOUT,
    QDRANT_URL,
    SERVICE_TOKEN,
)
from .retrieval import retrieve
from .vector_store.client import create_qdrant_client
from .vector_store.collection import ensure_collection

app = FastAPI(title="Priora Coaching RAG MVP")


def require_token(authorization: str | None) -> None:
    if not SERVICE_TOKEN:
        raise HTTPException(status_code=503, detail={"error_code": "MISSING_SERVICE_TOKEN"})
    if authorization != f"Bearer {SERVICE_TOKEN}":
        raise HTTPException(status_code=401, detail={"error_code": "UNAUTHORIZED"})


@app.get("/v1/health")
def health(authorization: str | None = Header(default=None)) -> dict[str, object]:
    require_token(authorization)
    if not QDRANT_URL:
        raise HTTPException(status_code=503, detail={"error_code": "MISSING_QDRANT_URL"})
    client = create_qdrant_client(
        QDRANT_URL,
        QDRANT_API_KEY,
        QDRANT_TIMEOUT,
    )
    ensure_collection(client, QDRANT_COLLECTION, EMBEDDING_DIMENSION)
    return {
        "status": "ok",
        "collection_name": QDRANT_COLLECTION,
        "embedding_model": EMBEDDING_MODEL,
        "embedding_dimension": EMBEDDING_DIMENSION,
        "qdrant": "ok",
    }


@app.post("/v1/search")
async def search_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    require_token(authorization)
    payload = await request.json()
    return {
        "results": retrieve(
            payload["question"] if "question" in payload else "",
            limit=payload["limit"] if "limit" in payload else None,
            score_threshold=(
                payload["score_threshold"] if "score_threshold" in payload else None
            ),
        )
    }
