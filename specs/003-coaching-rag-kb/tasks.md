# Tasks: Coaching RAG MVP

**Input**: Design documents from `/specs/003-coaching-rag-kb/` (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/rag-service.md`, `quickstart.md`)

**Tests**: Tests are required by the MVP spec. Use fake embedding/vector-store providers for unit and contract tests, local Qdrant for integration tests, and fake LLM + fake embedding providers for the full Assessment-to-Retrieval-to-Coaching-Plan e2e test.

**Scope Guard**: Tasks are only for the lean MVP. Do not implement snapshots, rollback, multi-version lifecycle, resumable ingestion, collection migrations, backup automation, full retrieval evaluation platforms, complex governance, independent plan/goal/action citation persistence, or exhaustive concurrency orchestration.

## Format: `[ID] [P?] [Story?] Description with file path`

- **[P]**: Can run in parallel with other tasks in the same phase after dependencies are met.
- **[Story]**: Required only for user-story phases.
- Every task is intentionally incomplete.

## Phase 1: Setup

**Purpose**: Create the MVP service boundary, shared test fixtures, and backend-facing contract tests without implementing behavior beyond scaffolding.

- [X] T001 Create `04-RAG/` Python/FastAPI project scaffold with package layout, app entrypoint, settings module, and test configuration in `04-RAG/pyproject.toml`, `04-RAG/src/priora_rag/main.py`, `04-RAG/src/priora_rag/settings.py`, and `04-RAG/tests/`
- [X] T002 [P] Add approved CBT PDF/Markdown fixture placeholders and expected metadata fixtures for Arabic/English extraction tests in `04-RAG/tests/fixtures/`
- [X] T003 [P] Add RAG API contract test skeletons for authenticated `POST /v1/ingest`, authenticated `POST /v1/retrieval/query`, unauthenticated minimal liveness, and protected readiness in `04-RAG/tests/contract/test_rag_api_contract.py`
- [X] T004 [P] Add NestJS boundary test proving Feature 002 will use a RAG API client abstraction and no Qdrant dependency in `02-BACKEND/tests/contract/coaching-rag-boundary.contract.spec.ts`

## Phase 2: Foundational RAG Components

**Purpose**: Add reusable MVP primitives required by all user stories: contracts, ports, metadata schemas, real/fake adapters, configuration, composition, and Qdrant collection validation.

- [X] T005 Define SourceMetadata, ChunkMetadata, RetrievalRequest, RetrievalResult, and error DTOs in `04-RAG/src/priora_rag/schemas.py`
- [X] T006 [P] Define embedding provider port plus fake embedding provider in `04-RAG/src/priora_rag/embedding.py` and `04-RAG/tests/unit/test_embedding_fake.py`
- [X] T007 [P] Implement the single production embedding-provider adapter for local Hugging Face Sentence Transformers `BAAI/bge-m3` with dimension `1024`, startup-only model loading, consistent embedding normalization for ingestion/retrieval, configured model-name and returned-dimension validation, timeout/model-loading/encoding error mapping, and secret-safe initialization in `04-RAG/src/priora_rag/embedding_provider.py` and `04-RAG/tests/unit/test_embedding_provider.py`
- [X] T008 [P] Define vector-store port plus fake vector store in `04-RAG/src/priora_rag/vector_store.py` and `04-RAG/tests/unit/test_vector_store_fake.py`
- [X] T009 Implement Qdrant adapter with one environment-specific collection name, model/dimension validation, idempotent point upsert, and approved/active payload filters in `04-RAG/src/priora_rag/qdrant_store.py`
- [X] T010 [P] Add redacted logging, correlation-id helpers, secret-safe settings validation, and service-auth dependency in `04-RAG/src/priora_rag/security.py` and `04-RAG/src/priora_rag/logging.py`
- [X] T011 Add early FastAPI application scaffold, settings loading, startup/readiness configuration validation hooks, and dependency placeholders without final service wiring in `04-RAG/src/priora_rag/app.py` and `04-RAG/src/priora_rag/main.py`

## Phase 3: User Story 1 - Ingest One Approved CBT Source (Priority: P1)

**Goal**: An internal operator can ingest one approved PDF/Markdown CBT source into Qdrant with deterministic chunks, idempotent upsert behavior, and citation metadata.

**Independent Test**: Ingest an approved Arabic/English fixture source twice, verify stable chunk ids and citations, embed through the fake provider in unit tests, and verify local Qdrant has no duplicate vectors after identical re-ingestion.

### Tests for User Story 1

- [X] T012 [P] [US1] Add extraction, normalization, chunking, file-validation, deterministic re-ingestion, and local Qdrant idempotent-upsert tests in `04-RAG/tests/unit/test_ingestion_pipeline.py` and `04-RAG/tests/integration/test_qdrant_ingestion.py`

### Implementation for User Story 1

- [X] T013 [US1] Implement PDF and Markdown text extraction with file type, size, readable-content, and unsafe path/name validation in `04-RAG/src/priora_rag/ingestion/extract.py`
- [X] T014 [US1] Implement deterministic Arabic/English normalization and chunking with stable chunk ids, text hashes, order, and page/heading/section citation anchors in `04-RAG/src/priora_rag/ingestion/chunking.py`
- [X] T015 [US1] Implement operator-only ingestion service that validates approved/active source metadata, embeds chunks, and idempotently upserts vectors with Qdrant payload metadata so identical content creates no duplicate vectors in `04-RAG/src/priora_rag/ingestion/service.py`
- [X] T016 [US1] Implement protected `POST /v1/ingest` endpoint and safe ingestion error responses in `04-RAG/src/priora_rag/api.py`

## Phase 4: User Story 2 - Retrieve Bounded Context from Assessment Dimensions (Priority: P1)

**Goal**: NestJS can request approved/active context from structured assessment dimensions and receive bounded, deduplicated, cited chunks.

**Independent Test**: Use a completed assessment fixture to call the RAG API and verify top-k, threshold, deduplication, context budget, citations, and insufficient-grounding behavior.

### Tests for User Story 2

- [X] T017 [P] [US2] Add retrieval selection tests for top-k, score threshold, deterministic deduplication, context budget, approved/active filtering, and insufficient grounding in `04-RAG/tests/unit/test_retrieval_selection.py`
- [X] T018 [P] [US2] Add RAG retrieval API contract tests for structured assessment-dimension requests and stable fail-closed responses in `04-RAG/tests/contract/test_rag_api_contract.py`

### Implementation for User Story 2

- [X] T019 [US2] Implement retrieval query validation that rejects raw answers/free text/safety answers and enforces configured limits in `04-RAG/src/priora_rag/retrieval/request_validation.py`
- [X] T020 [US2] Implement retrieval service with query embedding, Qdrant search, approved/active filtering, top-k, threshold, deduplication, context budget, and citation assembly in `04-RAG/src/priora_rag/retrieval/service.py`
- [X] T021 [US2] Wire final application composition from settings -> authentication -> `BAAI/bge-m3` embedding provider -> Qdrant adapter -> ingestion/retrieval services -> FastAPI routes, including authenticated `POST /v1/ingest`, authenticated `POST /v1/retrieval/query`, unauthenticated minimal liveness that exposes no dependency/configuration/version/secret details, and protected readiness that checks the embedding model and Qdrant, with startup/readiness failure on invalid required configuration in `04-RAG/src/priora_rag/app.py`, `04-RAG/src/priora_rag/main.py`, and `04-RAG/src/priora_rag/api.py`

## Phase 5: User Story 3 - Generate a Grounded Coaching Plan Through Feature 002 (Priority: P1)

**Goal**: Feature 002 calls RAG through the API only, includes bounded cited context in generation, validates citations against current returned chunks, and fails closed on RAG failure without changing existing Feature 002 lifecycle behavior.

**Independent Test**: Run one Assessment-to-Retrieval-to-Coaching-Plan e2e test using fake LLM and fake embedding providers, plus regression tests proving locale switching and existing Feature 002 failure/ownership/retention/deletion behavior remain unchanged.

### Tests for User Story 3

- [X] T022 [P] [US3] Add backend contract tests for structured assessment-dimension query construction, no raw answers, RAG unavailable, insufficient grounding, and no Qdrant dependency in `02-BACKEND/tests/contract/coaching-rag-boundary.contract.spec.ts`
- [X] T023 [P] [US3] Add full Assessment-to-Retrieval-to-Coaching-Plan e2e test with fake LLM and fake embedding providers in `02-BACKEND/tests/e2e/coaching-rag-plan.e2e-spec.ts`
- [X] T024 [P] [US3] Add Feature 002 regression tests proving locale switching reuses the already generated plan without another RAG call and failure, ownership, retention, and deletion behavior remain unchanged in `02-BACKEND/tests/e2e/coaching-plan.spec.ts`, `02-BACKEND/tests/e2e/account-deletion.spec.ts`, and `02-BACKEND/tests/e2e/retention-cleanup.spec.ts`

### Implementation for User Story 3

- [X] T025 [US3] Add NestJS RAG API client abstraction with service auth, timeout, typed DTOs, correlation id, and fail-closed error mapping in `02-BACKEND/src/modules/coaching/rag/rag-client.service.ts`
- [X] T026 [US3] Integrate structured assessment-dimension retrieval into Feature 002 grounding assembly without raw answers/free text/safety answers in `02-BACKEND/src/modules/coaching/coaching-grounding.service.ts`
- [X] T027 [US3] Add citation validation against current RAG response chunk ids and source metadata before plan persistence in `02-BACKEND/src/modules/coaching/coaching-plan-validator.ts`
- [X] T028 [US3] Modify frontend plan-query behavior only if T024 exposes an existing defect where locale switching calls RAG again; if needed, make the minimal fix in `03-FRONTEND/src/features/coaching/coaching-hooks.ts` and `03-FRONTEND/src/app/[locale]/(protected)/dashboard/page.tsx`, otherwise leave frontend code unchanged

## Phase 6: User Story 4 - Operate the MVP RAG Service Safely (Priority: P2)

**Goal**: The MVP protects internal endpoints, validates files, handles secrets safely, and emits redacted logs.

**Independent Test**: Attempt unauthenticated calls, invalid files, missing secrets, and retrieval failures; verify stable errors and redacted logs.

### Tests and Implementation for User Story 4

- [X] T029 [P] [US4] Add security tests for authenticated ingestion/retrieval, unauthenticated minimal liveness with no dependency/configuration/version/secret details, protected readiness checks for embedding model and Qdrant, source file validation, missing secrets, invalid startup/readiness configuration, and redacted logs in `04-RAG/tests/unit/test_security_and_logging.py`
- [X] T030 [US4] Enforce service authentication on ingestion, retrieval, and readiness endpoints while keeping liveness unauthenticated and minimal; add secret-safe configuration loading, startup/readiness failure on invalid required configuration, and redacted structured logs with correlation ids in `04-RAG/src/priora_rag/security.py`, `04-RAG/src/priora_rag/logging.py`, `04-RAG/src/priora_rag/app.py`, and `04-RAG/src/priora_rag/api.py`

## Phase 7: Polish & Cross-Cutting Validation

**Purpose**: Verify the MVP as an integrated slice without expanding scope.

- [X] T031 Update validation commands in `specs/003-coaching-rag-kb/quickstart.md` only if the documented commands are incomplete for running RAG unit tests, RAG contract tests, local Qdrant integration tests, NestJS contract tests, and the e2e test
- [X] T032 Run the complete MVP validation suite from `specs/003-coaching-rag-kb/quickstart.md` and record the result in the implementation handoff without introducing new product scope

## Dependencies

- Phase 1 Setup must complete before Phase 2.
- Phase 2 Foundational components must complete before US1, US2, US3, and US4 implementation.
- US1 must complete before US2 can retrieve real local Qdrant chunks.
- US2 must complete before US3 can integrate RAG context into Feature 002 generation.
- US4 can proceed after Phase 2 and should finish before final validation.
- Phase 7 final validation depends on US1, US2, US3, and US4.

## Parallel Execution Examples

- After T001: T002, T003, and T004 can run in parallel.
- After T005: T006, T007, T008, and T010 can run in parallel; T011 can proceed after settings shape is known.
- During US1: T012 can run before T013-T016 implementation completes.
- During US2: T017 and T018 can run in parallel before T019-T021 implementation completes.
- During US3: T022, T023, and T024 can run in parallel before T025-T028 implementation completes.
- During US4: T029 can run while T030 is implemented.

## Implementation Strategy

1. Deliver setup and foundational ports/adapters plus early application configuration first.
2. Implement US1 to make one approved CBT source searchable in local Qdrant with idempotent upsert behavior.
3. Implement US2 to return bounded cited retrieval context and complete final application composition once ingestion and retrieval services exist.
4. Implement US3 to wire retrieval into Feature 002 with citation validation and fail-closed behavior while preserving existing Feature 002 behavior.
5. Implement US4 security/logging hardening before final validation.
6. Stop at MVP; keep Future Enhancements deferred.
