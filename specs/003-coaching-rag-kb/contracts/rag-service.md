# Contract: RAG Service API MVP

The RAG service is internal. NestJS is the only application consumer. The frontend must never call these endpoints.

## Common Rules

- All endpoints require service authentication.
- All requests include `X-Correlation-Id`.
- Responses use JSON.
- Errors are stable and redacted.
- RAG never returns secrets, raw assessment answers, hidden chain-of-thought, or full source text beyond selected chunks.

## POST /v1/ingest

Internal operator-only command/protected endpoint to ingest the one approved CBT source.

### Request

```json
{
  "source_id": "cbt-coaching-v1",
  "source_title": "Approved CBT Coaching Source",
  "source_type": "pdf",
  "language": "mixed",
  "approved": true,
  "active": true,
  "source_uri": "operator-provided-internal-uri",
  "source_checksum": "sha256:..."
}
```

### Success Response: 202

```json
{
  "status": "accepted",
  "source_id": "cbt-coaching-v1",
  "collection_name": "priora_rag_local_cbt_fake_384",
  "correlation_id": "corr_123"
}
```

### Failure Responses

- `401 UNAUTHORIZED`: invalid service credentials.
- `400 INVALID_SOURCE_METADATA`: missing or invalid source metadata.
- `403 SOURCE_NOT_APPROVED`: `approved` or `active` is not true.
- `413 FILE_TOO_LARGE`: file exceeds configured limit.
- `415 UNSUPPORTED_SOURCE_TYPE`: not PDF or Markdown.
- `422 SOURCE_UNREADABLE`: corrupt, encrypted, scanned-only without readable text, wrong MIME, or parser failure.
- `503 EMBEDDING_UNAVAILABLE`: embedding provider unavailable.
- `503 VECTOR_STORE_UNAVAILABLE`: Qdrant unavailable.

## POST /v1/retrieval/query

Authenticated retrieval endpoint called by NestJS during Feature 002 generation.

### Request

```json
{
  "generation_attempt_id": "attempt_123",
  "assessment_result_id": "result_123",
  "assessment_definition_version": "1.0",
  "focus_areas": ["stress", "habits"],
  "support_domain": "stress",
  "strongest_domain": "relationships",
  "priority_codes": ["AG-01", "AG-02"],
  "language": "ar",
  "safety_exclusions": ["crisis", "high_risk", "medical", "medication"],
  "top_k": 6,
  "score_threshold": 0.7,
  "max_context_chars": 4000
}
```

### Success Response: 200

```json
{
  "status": "ok",
  "collection_name": "priora_rag_local_cbt_fake_384",
  "embedding_model": "fake-embedding-v1",
  "embedding_dimension": 384,
  "correlation_id": "corr_123",
  "chunks": [
    {
      "chunk_id": "chunk_abc",
      "text": "Short selected chunk text...",
      "score": 0.84,
      "source_id": "cbt-coaching-v1",
      "source_title": "Approved CBT Coaching Source",
      "source_type": "pdf",
      "citation_page": 4,
      "citation_heading": "Stress skills",
      "citation_section": "paced-breathing",
      "text_hash": "sha256:..."
    }
  ],
  "budget": {
    "returned_chunks": 1,
    "returned_characters": 28,
    "max_context_chars": 4000
  }
}
```

### Insufficient Grounding Response: 200

```json
{
  "status": "insufficient_grounding",
  "collection_name": "priora_rag_local_cbt_fake_384",
  "correlation_id": "corr_123",
  "chunks": [],
  "budget": {
    "returned_chunks": 0,
    "returned_characters": 0,
    "max_context_chars": 4000
  },
  "error_code": "INSUFFICIENT_GROUNDING"
}
```

### Failure Responses

- `401 UNAUTHORIZED`: invalid service credentials.
- `400 INVALID_RETRIEVAL_REQUEST`: malformed request or out-of-range limits.
- `409 EMBEDDING_DIMENSION_MISMATCH`: configured model/dimension does not match collection metadata.
- `503 VECTOR_STORE_UNAVAILABLE`: Qdrant unavailable.
- `503 EMBEDDING_UNAVAILABLE`: embedding provider unavailable for query embedding.

## GET /v1/health

Service and dependency health for NestJS readiness checks.

### Success Response: 200

```json
{
  "status": "ok",
  "collection_name": "priora_rag_local_cbt_fake_384",
  "embedding_model": "fake-embedding-v1",
  "embedding_dimension": 384,
  "qdrant": "ok"
}
```

### Degraded Response: 503

```json
{
  "status": "unavailable",
  "qdrant": "unavailable",
  "error_code": "VECTOR_STORE_UNAVAILABLE"
}
```

## Citation Validation Contract in NestJS

Feature 002 validation treats the current `RetrievalResult.chunks[*].chunk_id` list as the only valid citation set for that generation attempt. Generated citations that reference any other chunk id, omit required source metadata, or contradict returned source metadata are rejected before a usable plan is persisted.
