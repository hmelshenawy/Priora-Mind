# Feature Specification: Coaching RAG MVP

**Feature Branch**: `003-coaching-rag-kb`

**Feature Directory**: `specs/003-coaching-rag-kb`

**Created**: 2026-08-01

**Status**: Draft - Lean MVP Scope; Implementation Not Started

**Input**: Build the first usable Coaching RAG MVP: ingest one approved CBT coaching source, extract and normalize Arabic/English text, chunk and embed it into a new Qdrant collection, retrieve bounded relevant chunks from structured assessment dimensions, return source citations, and use that context to generate a grounded coaching plan through the existing NestJS-owned Feature 002 lifecycle. Do not implement Feature 003 yet.

## MVP Scope

The MVP proves the smallest safe RAG loop for Feature 002 coaching-plan generation:

- A standalone Python/FastAPI service under `04-RAG/` owns ingestion, cleaning, chunking, embeddings, Qdrant access, and retrieval.
- NestJS calls only the authenticated RAG API; it never connects directly to Qdrant.
- The frontend never accesses RAG or Qdrant.
- Ingestion is an internal operator-only command or protected endpoint and is never exposed to or called directly by the frontend.
- One approved CBT coaching source is ingested from PDF or Markdown.
- Arabic and English text are extracted, safely normalized, deterministically chunked, embedded, and stored in one environment-specific Qdrant collection.
- Source and chunk metadata are stored in Qdrant payloads; no separate document-registry database is required for the MVP.
- Retrieval is driven by structured Feature 002 assessment dimensions and sends no raw personal answers.
- Retrieval returns bounded top-k chunks with score thresholding, deduplication, context-budget enforcement, and verifiable source citations.
- Feature 002 generation uses the returned context and citations through the existing generation lifecycle, validation, retry, ownership, retention, and deletion boundaries.
- RAG failure, insufficient grounding, or citation mismatch fails closed; no ungrounded coaching plan is produced.

## Explicit MVP Non-Goals

- No multi-source knowledge-base management beyond one approved CBT source.
- No immutable multi-version lifecycle beyond a simple approved/active flag.
- No atomic knowledge snapshots, rollback, supersession automation, or revocation automation.
- No resumable background ingestion pipeline.
- No embedding collection migration orchestration.
- No stale-vector cleanup automation.
- No automated Qdrant backup/recovery workflow.
- No full offline evaluation platform with production Recall@K/Precision@K gates.
- No independently persisted plan/goal/action citation tables in the MVP.
- No complex governance or multi-approver workflows.
- No exhaustive new orchestration for retries, retakes, late results, or concurrency beyond preserving the existing Feature 002 behavior.
- No user-facing RAG UI, chat, session memory, web crawling, admin portal, or direct frontend-to-RAG access, including ingestion.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ingest One Approved CBT Source (Priority: P1)

An internal operator provides one already approved CBT coaching source through an operator-only command or protected endpoint, and the RAG service extracts, normalizes, chunks, embeds, and indexes it for retrieval.

**Why this priority**: Retrieval cannot support coaching generation until there is at least one approved, searchable source with reliable citations.

**Independent Test**: Ingest an approved Arabic/English fixture source, verify deterministic chunks and source citations, embed through a fake provider in unit tests, and index into local Qdrant in integration tests.

**Acceptance Scenarios**:

1. **Given** one approved CBT source with required metadata and an allowed file type, **When** ingestion runs, **Then** text is extracted, normalized, chunked, embedded, and stored in the configured Qdrant collection.
2. **Given** the same source and settings are ingested again, **When** chunking runs, **Then** the same chunk ids, chunk order, and citation anchors are produced.
3. **Given** the source is not explicitly approved/active, **When** retrieval is requested, **Then** the source is not searchable for coaching generation.

---

### User Story 2 - Retrieve Bounded Context from Assessment Dimensions (Priority: P1)

Feature 002 builds a structured retrieval request from assessment-derived coaching dimensions and receives a small set of relevant, cited chunks without sending raw answers or unnecessary personal data.

**Why this priority**: The MVP must replace full-library prompt stuffing with focused, privacy-preserving, assessment-traceable grounding.

**Independent Test**: Use a completed assessment fixture to build a retrieval request, call the RAG API, and verify returned chunks are relevant to the requested dimensions, bounded by top-k and context budget, deduplicated, above threshold, and cited.

**Acceptance Scenarios**:

1. **Given** an eligible Feature 002 generation attempt, **When** NestJS requests retrieval, **Then** the request contains assessment dimensions, focus/domain priorities, language needs, and safety exclusions, but no raw answers, free text, or safety answers.
2. **Given** matching approved chunks exist, **When** retrieval runs, **Then** the response contains at most the configured top-k chunks, each with score, source id, source title, source type, page, heading, or section anchor when available, and chunk id.
3. **Given** duplicate or near-duplicate chunks are retrieved, **When** the response is assembled, **Then** duplicates are removed deterministically before the context budget is applied.
4. **Given** relevant chunks are below the score threshold or the result set is insufficient, **When** retrieval completes, **Then** RAG returns an insufficient-grounding response and Feature 002 fails closed.

---

### User Story 3 - Generate a Grounded Coaching Plan Through Feature 002 (Priority: P1)

The existing NestJS-owned Feature 002 generation lifecycle uses retrieved RAG context to generate a grounded coaching plan while preserving existing eligibility, safety, retry, ownership, retention, and deletion behavior.

**Why this priority**: RAG is valuable only if it integrates safely into the current coaching-plan generation path without weakening Feature 002 guarantees.

**Independent Test**: Run one Assessment-to-Retrieval-to-Plan e2e test using fake LLM and fake embedding providers; verify generation receives bounded cited context, rejects unsupported citations, and fails closed on RAG failure.

**Acceptance Scenarios**:

1. **Given** RAG returns cited chunks, **When** Feature 002 assembles the generation prompt, **Then** only bounded returned context and citation metadata are included, not the full source or full coaching library.
2. **Given** the generated plan references source citations, **When** post-generation validation runs, **Then** every citation must match a chunk returned by the RAG response for that generation attempt.
3. **Given** RAG is unavailable, times out, returns insufficient grounding, or returns malformed citations, **When** generation runs, **Then** Feature 002 transitions to its safe failed/unavailable path and persists no usable ungrounded plan.
4. **Given** the user switches locale after generation, **When** the dashboard re-renders, **Then** no new RAG retrieval is triggered and the existing Feature 002 bilingual plan behavior is preserved.

---

### User Story 4 - Operate the MVP RAG Service Safely (Priority: P2)

The MVP service protects internal endpoints, validates files, handles secrets safely, and emits redacted logs that allow debugging without exposing sensitive content.

**Why this priority**: Even a lean RAG service ingests files and influences AI output, so basic operational safety is required from the first implementation.

**Independent Test**: Attempt unauthenticated calls, invalid files, missing secrets, and retrieval failures; verify stable errors, redacted logs, and no Qdrant/frontend boundary violations.

**Acceptance Scenarios**:

1. **Given** a request lacks valid service authentication, **When** it calls ingestion or retrieval, **Then** the RAG service rejects it before performing file, embedding, or Qdrant operations.
2. **Given** a file is oversized, wrong MIME type, corrupt, encrypted, or path-like, **When** ingestion is attempted, **Then** it is rejected with a safe error and is not indexed.
3. **Given** logs or metrics are emitted, **When** ingestion or retrieval runs, **Then** they include correlation ids, counts, timings, and error codes but not raw assessment answers, full source text, secrets, or generated plan content.

### Edge Cases

- Empty, corrupt, encrypted, scanned-only, oversized, wrong-MIME, or unsupported files are rejected and not indexed.
- Markdown headings, links, tables, and code blocks do not create misleading citation anchors.
- Arabic/English mixed text remains readable after normalization and chunking.
- Embedding model or vector dimension mismatch blocks indexing and retrieval for the configured collection.
- Missing Qdrant collection, unavailable Qdrant, or unavailable embedding provider returns a stable fail-closed error.
- Retrieval with no chunks above threshold returns insufficient grounding rather than padding with irrelevant content.
- Source citations must be derived from stored chunk metadata, not generated freely by the LLM.
- Locale switching must not trigger RAG retrieval.
- Existing Feature 002 retry/failed-state behavior remains authoritative if RAG fails.
- Frontend direct access to RAG and NestJS direct access to Qdrant remain prohibited.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The MVP MUST provide a standalone Python/FastAPI RAG service under `04-RAG/` that owns ingestion, cleaning, chunking, embedding, Qdrant access, retrieval, and service health.
- **FR-002**: NestJS MUST call only the authenticated RAG API and MUST NOT connect directly to Qdrant or depend on Qdrant payload internals.
- **FR-003**: The frontend MUST NOT call the RAG service or Qdrant; all user-facing behavior remains mediated by NestJS.
- **FR-004**: The MVP MUST ingest one explicitly approved CBT coaching source from PDF or Markdown through an internal operator-only command or protected endpoint that is never exposed to or called directly by the frontend.
- **FR-005**: The MVP MUST store simple source metadata in Qdrant payloads: source id, title, source type, language/mixed-language marker, approval/active flag, checksum, and citation base metadata; no separate document-registry database is required for the MVP.
- **FR-006**: Only content marked approved and active MAY be searchable or returned for coaching generation.
- **FR-007**: The MVP MUST extract Arabic and English text while preserving readable text order and citation anchors such as page, heading, or section anchor when available; unstable PDF or Markdown line numbers are not required.
- **FR-008**: The MVP MUST clean and normalize text deterministically without rewriting approved coaching meaning.
- **FR-009**: The MVP MUST chunk deterministically so unchanged source text and settings produce stable chunk ids, order, hashes, and citations.
- **FR-010**: The MVP MUST use one configurable embedding provider behind a small embedding port and provide a fake embedding provider for tests.
- **FR-011**: The MVP MUST use Qdrant behind a vector-store port and provide a fake vector-store provider for unit/contract tests where appropriate.
- **FR-012**: The MVP MUST create or use one environment-specific Qdrant collection whose configured embedding model and dimension are validated before indexing and retrieval.
- **FR-013**: The MVP MUST store simple chunk metadata in Qdrant payloads with each vector: chunk id, source id, source title, source type, language, citation anchor, text hash, approval/active marker, embedding model, and embedding dimension.
- **FR-014**: NestJS MUST construct structured retrieval requests from Feature 002 assessment dimensions, focus/domain priorities, language needs, and safety exclusions.
- **FR-015**: Retrieval requests MUST NOT include raw assessment answers, user free text, safety answers, hidden chain-of-thought, or unnecessary personal data.
- **FR-016**: Retrieval MUST apply top-k, score thresholding, deterministic deduplication, and a configurable context budget before returning chunks.
- **FR-017**: Retrieval MUST return each chunk with verifiable source citation metadata, score, chunk id, and source metadata.
- **FR-018**: Feature 002 generation MUST include only bounded returned chunks and citation metadata in the prompt, never the full CBT source or full coaching library.
- **FR-019**: Feature 002 post-generation validation MUST reject unsupported or fabricated citations that do not match chunks returned by the RAG response for that attempt.
- **FR-020**: If RAG is unavailable, times out, returns malformed data, or returns insufficient grounding, Feature 002 MUST fail closed using its existing safe failed/unavailable behavior.
- **FR-021**: Automated tests MUST include fake-provider unit tests, RAG API contract tests, local Qdrant integration tests, and one Assessment-to-Retrieval-to-Plan e2e test using fake LLM and fake embedding providers.
- **FR-022**: The MVP MUST require basic service authentication for RAG endpoints used by NestJS.
- **FR-023**: The MVP MUST validate uploaded/source files for allowed type, size, readable content, safe path/name handling, and parser failure before indexing.
- **FR-024**: The MVP MUST keep secrets in environment/configuration and MUST NOT log secrets, raw assessment answers, full source text, or generated plan content.
- **FR-025**: The MVP MUST emit redacted logs with correlation id, operation, counts, timing, and safe error codes for ingestion and retrieval.
- **FR-026**: The MVP MUST preserve the existing Feature 002 lifecycle ownership for eligibility, generation status, retry behavior, acceptance, locale switching, ownership, retention, and deletion.

### Key Entities *(include if feature involves data)*

- **SourceMetadata**: Simple Qdrant payload metadata for the one approved CBT source: id, title, type, checksum, language marker, approved/active flag, and citation base metadata.
- **ChunkMetadata**: Qdrant payload metadata attached to each chunk/vector: chunk id, source id/title/type, language, text hash, order, citation anchor, embedding model/dimension, and active marker.
- **RetrievalRequest**: Structured NestJS request built from assessment dimensions, priorities, language needs, safety exclusions, top-k, threshold, context budget, and correlation id.
- **RetrievalResult**: Bounded response containing chunks, scores, source citations, budget metadata, and insufficient-grounding status.
- **RagContextForGeneration**: The bounded retrieved context passed into the existing Feature 002 generation flow for a single generation attempt.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: One approved CBT PDF or Markdown fixture can be ingested, chunked, embedded, indexed into local Qdrant, and retrieved through the RAG API.
- **SC-002**: Re-ingesting the same fixture with the same settings produces identical chunk ids, chunk order, and text hashes in tests.
- **SC-003**: 100% of generation retrieval responses contain only approved/active chunks.
- **SC-004**: 100% of retrieval responses respect configured top-k, score threshold, deduplication, and context-budget limits in tests.
- **SC-005**: 100% of returned chunks include source citation metadata sufficient to verify source id/title/type and page, heading, or section anchor when available.
- **SC-006**: 100% of unsupported or fabricated citation test cases are rejected before a usable coaching plan is persisted.
- **SC-007**: RAG unavailable, Qdrant unavailable, embedding unavailable, malformed response, and insufficient-grounding tests all result in Feature 002 fail-closed behavior.
- **SC-008**: One full Assessment-to-Retrieval-to-Plan e2e test passes using fake LLM and fake embedding providers.
- **SC-009**: Local Qdrant integration tests validate collection creation/use, embedding dimension validation, metadata filtering, and retrieval.
- **SC-010**: Security tests verify authenticated RAG access, file validation, secret handling, and redacted logging.

## Future Enhancements *(Not MVP Acceptance Criteria)*

These items preserve the long-term production architecture direction but are excluded from MVP acceptance criteria and must not block the first implementation:

- Immutable multi-version document lifecycle beyond a simple approved/active flag.
- Atomic knowledge snapshots and rollback.
- `SUPERSEDED` and `REVOKED` lifecycle automation.
- Resumable background ingestion.
- Collection migration orchestration.
- Stale-vector cleanup automation.
- Automated backup and recovery.
- Full offline Recall@K and Precision@K evaluation platform.
- Citations persisted independently at plan, goal, and action levels.
- Complex governance and multi-approver workflows.
- Exhaustive retries, retakes, late-result, and concurrency orchestration beyond preserving existing Feature 002 behavior.
- Multi-source knowledge-base management, source supersession, and historical citation status displays.
- Advanced monitoring dashboards, release gates based on retrieval metrics, and automated rollback drills.

## Assumptions

- The first source is already approved by the appropriate content/safety and legal/privacy review before it is marked searchable.
- The MVP can use one configured embedding provider and one Qdrant collection per environment.
- The existing Feature 002 generation lifecycle remains authoritative; Feature 003 adds retrieval context only.
- Citation validation in the MVP can be performed against the RAG response for the current generation attempt without adding independent citation persistence tables.
- Automated tests use fake providers unless explicitly validating local Qdrant integration.

## Reference Alignment *(mandatory)*

- **PRD.md**: Supports AI-personalized coaching by replacing full-library prompt stuffing with bounded, cited, approved CBT context while preserving non-clinical coaching scope.
- **SAD.md**: Keeps the long-term RAG/Qdrant direction but narrows MVP implementation to one approved source, one environment-specific collection, and API-only NestJS integration. `04-RAG/` owns Qdrant; NestJS owns Feature 002 generation lifecycle.
- **Frontend_Architecture.md**: No direct frontend changes are required for RAG access. The dashboard continues to call NestJS coaching endpoints only, and locale switching must not trigger retrieval.
- **Conflicts / Gaps**: The current broader planning package may still describe long-term production architecture. For MVP implementation, this `spec.md` is authoritative for scope; broader lifecycle/snapshot/evaluation items are Future Enhancements unless explicitly reintroduced later.
