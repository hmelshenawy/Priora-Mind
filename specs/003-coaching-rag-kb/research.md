# Research: Coaching RAG MVP

## Decision 1: Standalone `04-RAG/` FastAPI Service

**Decision**: Build the MVP RAG capability as a standalone Python/FastAPI service under `04-RAG/`.

**Rationale**: PDF/Markdown extraction, embedding, and Qdrant integration are operational concerns separate from NestJS coaching-domain behavior. A service boundary keeps Qdrant out of NestJS and lets Feature 002 remain generation owner.

**Alternatives considered**: Implement RAG inside NestJS; rejected because it couples coaching generation to vector-store and extraction libraries. Build a separate worker/queue architecture; deferred because resumable background ingestion is not MVP scope.

## Decision 2: One Approved CBT Source

**Decision**: MVP ingests one explicitly approved CBT coaching source from PDF or Markdown.

**Rationale**: One approved source is enough to validate extraction, chunking, embedding, retrieval, citations, and Feature 002 integration without introducing multi-source governance or lifecycle complexity.

**Alternatives considered**: Multi-source KB registry; deferred as Future Enhancement. Unapproved fixture content; rejected because only approved/active content may influence generation.

## Decision 3: Source and Chunk Metadata in Qdrant Payloads

**Decision**: Store MVP source and chunk metadata directly in Qdrant payloads with each vector.

**Rationale**: The MVP has one approved source and one collection, so a separate document-registry database is not required. Qdrant payload filters are sufficient for active-only retrieval and citation metadata.

**Alternatives considered**: Dedicated RAG metadata database; deferred until multi-source/multi-version lifecycle requires stronger registry semantics.

## Decision 4: Deterministic Cleaning and Chunking

**Decision**: Normalize text conservatively and derive stable chunk ids from source id, checksum, normalized text hash, chunk order, and chunking settings.

**Rationale**: Stable chunks make tests reproducible and citation validation reliable while avoiding meaning-changing transformations.

**Alternatives considered**: Tool-generated opaque chunk ids; rejected because unchanged input could produce unstable citations.

## Decision 5: Citation Location Metadata

**Decision**: Citation metadata records page, heading, or section anchor when available. Unstable PDF or Markdown line numbers are not required.

**Rationale**: Page/heading/section anchors are more stable and user-verifiable across extraction runs and document formatting changes.

**Alternatives considered**: Require exact line numbers; rejected as brittle for PDFs and Markdown formatting.

## Decision 6: Embedding Provider Port and MVP Production Adapter

**Decision**: Use one configurable embedding provider behind a small RAG-owned port. The only MVP production embedding adapter is local Python inference with Hugging Face Sentence Transformers using `BAAI/bge-m3` with embedding dimension `1024`. Embeddings MUST be normalized consistently during both ingestion and retrieval. The model is loaded once during application startup, not per request. The adapter validates the configured model name and returned vector dimension, and maps model-loading, encoding, and timeout failures to safe internal errors. Keep the existing fake embedding provider for deterministic automated tests.

**Rationale**: `BAAI/bge-m3` supports multilingual retrieval suitable for Arabic/English MVP content, runs locally without a paid external API, and avoids sending source/query text to a third-party embedding service. Loading once at startup avoids per-request model initialization latency and makes readiness checks meaningful.

**Alternatives considered**: A paid external embedding API was rejected for MVP because provider privacy/retention review would add launch dependency and cost. Multiple production embedding providers were rejected as unnecessary scope. Hard-coding embedding behavior without a port was rejected because deterministic fake tests and future replacement would be harder.

## Decision 7: Qdrant Behind Vector-Store Port

**Decision**: Use Qdrant as the initial vector store behind a vector-store port.

**Rationale**: SAD already identifies Qdrant, and the port prevents NestJS or retrieval business logic from depending on Qdrant-specific APIs.

**Alternatives considered**: Direct Qdrant usage throughout RAG code; rejected because it makes future replacement and fake tests harder.

## Decision 8: One Environment-Specific Collection

**Decision**: Use one Qdrant collection per environment for the MVP, with collection metadata validating embedding model and dimension.

**Rationale**: Environment isolation and dimension checks prevent accidental cross-environment or wrong-model retrieval without requiring collection migration orchestration.

**Alternatives considered**: Versioned collection migration framework; deferred as Future Enhancement.

## Decision 9: Structured Assessment-Dimension Retrieval

**Decision**: NestJS builds retrieval requests from Feature 002 assessment dimensions, focus/domain priorities, language needs, and safety exclusions, without raw answers, free text, or safety answers.

**Rationale**: Feature 002 owns assessment evidence and privacy boundaries. Retrieval should receive enough structure for relevance without exposing unnecessary personal data.

**Alternatives considered**: Send raw assessment answers to RAG; rejected for privacy and scope reasons.

## Decision 10: Deterministic Retrieval Selection

**Decision**: Retrieval applies top-k, score threshold, deterministic deduplication, and context budget before returning chunks.

**Rationale**: The generated plan should be grounded in a small, relevant, non-duplicative context bundle.

**Alternatives considered**: Return raw vector-search results directly; rejected because it can exceed prompt budgets and include duplicates or weak matches.

## Decision 11: Fail-Closed Insufficient Grounding

**Decision**: RAG returns a stable insufficient-grounding/unavailable response when dependencies fail or retrieved context is too weak; Feature 002 generation fails closed.

**Rationale**: It is safer to show the existing retryable unavailable state than generate unsupported coaching content.

**Alternatives considered**: Generate with no context or a generic fallback; rejected because the MVP purpose is grounded generation.

## Decision 12: Citation Validation Against Current RAG Response

**Decision**: For MVP, NestJS validates generated citations against chunks returned by the RAG response for the current generation attempt. No independent plan/goal/action citation persistence tables are added.

**Rationale**: This satisfies citation integrity without adding future-oriented persistence complexity.

**Alternatives considered**: Persist citations independently by plan/goal/action; deferred as Future Enhancement.

## Decision 13: Operator-Only Ingestion

**Decision**: Ingestion is exposed only through an internal operator command or protected endpoint; it is never frontend-accessible.

**Rationale**: Users should not upload or manage coaching sources in the MVP, and ingestion can affect AI output.

**Alternatives considered**: Admin UI or frontend-triggered ingestion; rejected as outside MVP scope.

## Decision 14: Basic Security and Observability

**Decision**: MVP includes service authentication, file validation, environment/secret configuration, correlation IDs, and redacted logs.

**Rationale**: Even a lean internal service handles files and influences AI output, so basic safety is required.

**Alternatives considered**: Delay security controls until production hardening; rejected because unauthenticated RAG endpoints and unsafe file handling would violate project principles.
