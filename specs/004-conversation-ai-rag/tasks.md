# Tasks: Conversation AI and RAG Orchestration

**Input**: Design documents from `/specs/004-conversation-ai-rag/`

**Prerequisites**: `specs/004-conversation-ai-rag/plan.md`, `specs/004-conversation-ai-rag/spec.md`, `specs/004-conversation-ai-rag/research.md`, `specs/004-conversation-ai-rag/data-model.md`, `specs/004-conversation-ai-rag/contracts/conversation-ai-api.md`, `specs/004-conversation-ai-rag/quickstart.md`

**Tests**: Required by `specs/004-conversation-ai-rag/spec.md` FR-067 through FR-072. Write story tests before implementation and keep paid/live LLM calls out of automated tests.

**Organization**: Tasks are grouped by phase and user story so each story can be implemented and verified independently after the shared foundation is complete.

## Phase 1: Setup - Schema, Contracts, and Test Harness

**Purpose**: Create shared files, test scaffolding, and module skeletons used by later tasks. No runtime behavior is complete at the end of this phase.

- [X] T001 Create conversation module directories in `02-BACKEND/src/modules/conversations/`, `02-BACKEND/src/modules/conversations/ports/`, and `02-BACKEND/src/modules/conversations/rag/`
- [X] T002 Create conversation test directories in `02-BACKEND/tests/unit/conversations/`, `02-BACKEND/tests/contract/conversations/`, and `02-BACKEND/tests/e2e/conversations/`
- [X] T003 Create Python RAG fixture integration test directory in `02-BACKEND/tests/integration/rag/`
- [X] T004 [P] Create deterministic conversation fixture helpers in `02-BACKEND/tests/helpers/conversation-fixtures.ts`
- [X] T005 [P] Create fake conversation RAG client fixtures in `02-BACKEND/tests/helpers/fake-conversation-rag-client.ts`
- [X] T006 [P] Create fake conversation LLM provider fixtures in `02-BACKEND/tests/helpers/fake-conversation-llm.ts`
- [X] T007 [P] Create auth/onboarding eligibility test helpers for completed, incomplete, and SAFETY_HOLD users in `02-BACKEND/tests/helpers/conversation-auth-fixtures.ts`
- [X] T008 Add Spec 004 contract test skeleton exports in `02-BACKEND/tests/contract/conversations/conversation-api.contract.spec.ts`

---

## Phase 2: Foundational - Blocking Prerequisites

**Purpose**: Add schema, shared types, validation, provider ports, module wiring, and safe metadata conventions required by all user stories.

**Critical**: No user story work should begin until this phase is complete.

### Tests for Foundation

- [X] T009 [P] Add Prisma schema contract tests for conversation cascade, indexes, idempotency uniqueness, and assistant-source constraints in `02-BACKEND/tests/unit/conversations/conversation-schema.spec.ts`
- [X] T010 [P] Add request/response DTO validation tests for conversation create/list/retrieve/patch/delete/send in `02-BACKEND/tests/unit/conversations/conversation-dto.spec.ts`
- [X] T011 [P] Add provider-port fake behavior tests for grounded answer generation and follow-up rewrite in `02-BACKEND/tests/unit/conversations/conversation-ai-ports.spec.ts`

### Implementation

- [X] T012 Add `ConversationStatus`, `ConversationMessageRole`, `ConversationMessageRoute`, `ConversationMessageStatus`, `Conversation`, `ConversationMessage`, and `AssistantMessageSource` models to `02-BACKEND/prisma/schema.prisma`
- [X] T013 Create Prisma migration for conversation tables, indexes, cascade relations, user-message idempotency uniqueness, and one-assistant-per-user-message uniqueness in `02-BACKEND/prisma/migrations/202608020004_conversation_ai/migration.sql`
- [X] T014 Add conversation DTO schemas and exported TypeScript types for create/list/retrieve/patch/send responses in `02-BACKEND/src/modules/conversations/conversation.dto.ts`
- [X] T015 Add stable conversation error classes and safe error codes for validation, ownership, archive, eligibility, idempotency, RAG, LLM, safety, and citation failures in `02-BACKEND/src/modules/conversations/conversation.errors.ts`
- [X] T016 Add conversation module shell with providers and exports in `02-BACKEND/src/modules/conversations/conversations.module.ts`
- [X] T017 Register `ConversationsModule` in the root Nest module imports in `02-BACKEND/src/app.module.ts`
- [X] T018 Add provider-neutral conversation AI port definitions for grounded answer generation and follow-up rewrite in `02-BACKEND/src/modules/ai/conversation-ai.port.ts`
- [X] T019 Add fake conversation AI provider implementation for tests and disabled-provider behavior in `02-BACKEND/src/modules/ai/fake-conversation-ai.adapter.ts`
- [X] T020 Add conversation RAG client port, normalized statuses, request type, chunk type, and result type targeting Python `/v1/search` in `02-BACKEND/src/modules/conversations/rag/conversation-rag-client.port.ts`
- [X] T021 Add conversation constants for bounded history, message length, title length, RAG limit, score threshold, context budget, fallback copy, and supported command copy in `02-BACKEND/src/modules/conversations/conversation.constants.ts`
- [X] T022 Add safe message serialization helpers for API responses and source snapshots in `02-BACKEND/src/modules/conversations/conversation-presenter.ts`

**Checkpoint**: Prisma schema, migration, module skeleton, DTOs, provider ports, and test fakes are ready for story implementation.

---

## Phase 3: User Story 1 - Create and View Conversations (Priority: P1) MVP

**Goal**: An authenticated, verified, completed-onboarding user can create, list, retrieve, archive, unarchive, and hard-delete only their own conversations.

**Independent Test**: Use authenticated API calls to create one conversation, list it, retrieve it with messages, archive/unarchive/delete it, and verify another user receives `CONVERSATION_NOT_FOUND` without content leakage.

### Tests for User Story 1

- [X] T023 [P] [US1] Add contract tests for `POST /api/v1/conversations`, `GET /api/v1/conversations`, `GET /api/v1/conversations/:conversationId`, `PATCH /api/v1/conversations/:conversationId`, and `DELETE /api/v1/conversations/:conversationId` in `02-BACKEND/tests/contract/conversations/conversation-api.contract.spec.ts`
- [X] T024 [P] [US1] Add e2e tests for conversation eligibility, owner isolation, list ordering, pagination, archive filtering, unarchive, and hard delete in `02-BACKEND/tests/e2e/conversations/conversation-lifecycle.e2e-spec.ts`
- [X] T025 [P] [US1] Add unit tests for conversation ownership and eligibility service behavior in `02-BACKEND/tests/unit/conversations/conversation-access.spec.ts`

### Implementation for User Story 1

- [X] T026 [US1] Implement conversation eligibility checks for authenticated, email-verified, onboarding `COMPLETED`, and not `SAFETY_HOLD` users in `02-BACKEND/src/modules/conversations/conversation-access.service.ts`
- [X] T027 [US1] Implement owner-scoped create/list/retrieve/archive/unarchive/delete persistence methods in `02-BACKEND/src/modules/conversations/conversation.repository.ts`
- [X] T028 [US1] Implement conversation lifecycle service orchestration and safe `CONVERSATION_NOT_FOUND` behavior for missing or foreign ids in `02-BACKEND/src/modules/conversations/conversation-lifecycle.service.ts`
- [X] T029 [US1] Implement protected conversation lifecycle endpoints with `JwtAuthGuard`, `EmailVerifiedGuard`, Zod validation, and no client `userId` trust in `02-BACKEND/src/modules/conversations/conversations.controller.ts`
- [X] T030 [US1] Wire lifecycle providers into `02-BACKEND/src/modules/conversations/conversations.module.ts`
- [X] T031 [US1] Add account-deletion cascade coverage for conversations, messages, and sources in `02-BACKEND/src/modules/retention/account-deletion.service.ts`

**Checkpoint**: User Story 1 is independently functional and testable without RAG or LLM dependencies.

---

## Phase 4: User Story 2 - Send Message and Persist Assistant Response (Priority: P1)

**Goal**: A user sends a valid message to an active owned conversation and receives persisted user and assistant message records with route, status, timestamps, sources, and idempotent retry behavior.

**Independent Test**: Send a valid message through the API with fake safety/RAG/LLM dependencies and verify exactly one user message, exactly one assistant message, response shape, and retry behavior for the same idempotency key.

### Tests for User Story 2

- [X] T032 [P] [US2] Add send-message contract tests for validation, required `X-Idempotency-Key`, archived-conversation rejection, response shape, and stable error codes in `02-BACKEND/tests/contract/conversations/conversation-message.contract.spec.ts`
- [X] T033 [P] [US2] Add e2e tests for send-message persistence, message ordering, active-conversation requirement, and same-key retry returning stored final results in `02-BACKEND/tests/e2e/conversations/conversation-send.e2e-spec.ts`
- [X] T034 [P] [US2] Add unit tests for transactional idempotency claim and one-assistant-per-user-message enforcement in `02-BACKEND/tests/unit/conversations/conversation-idempotency.spec.ts`

### Implementation for User Story 2

- [X] T035 [US2] Implement message repository methods for user-message insertion, assistant-message insertion, source insertion, chronological pagination, and idempotency lookup in `02-BACKEND/src/modules/conversations/conversation-message.repository.ts`
- [X] T036 [US2] Implement send-message idempotency claim and final-result replay logic in `02-BACKEND/src/modules/conversations/conversation-idempotency.service.ts`
- [X] T037 [US2] Implement synchronous send-message service shell that validates ownership, rejects archived conversations, persists the user message before routing, and persists a deterministic fake assistant result in `02-BACKEND/src/modules/conversations/conversation-message.service.ts`
- [X] T038 [US2] Add `POST /api/v1/conversations/:conversationId/messages` and message pagination response mapping to `02-BACKEND/src/modules/conversations/conversations.controller.ts`
- [X] T039 [US2] Update conversation `updatedAt` and `lastMessageAt` after user and assistant message persistence in `02-BACKEND/src/modules/conversations/conversation.repository.ts`
- [X] T040 [US2] Wire message repository, idempotency service, and message service into `02-BACKEND/src/modules/conversations/conversations.module.ts`

**Checkpoint**: User Story 2 is independently functional with fake orchestration and idempotent persistence.

---

## Phase 5: User Story 8 - Static and System-Command Routes Avoid AI Calls (Priority: P2, Implemented Early)

**Goal**: Greetings, thanks, scope/help commands, and supported backend commands complete without RAG or LLM calls after safety passes.

**Independent Test**: Send greeting, thanks, and command fixtures and verify route `STATIC_RESPONSE` or `SYSTEM_COMMAND`, completed assistant state, empty sources, and zero RAG/LLM calls.

### Tests for User Story 8

- [X] T041 [P] [US8] Add unit tests for static greeting/thanks detection, command detection, and safety-before-static ordering in `02-BACKEND/tests/unit/conversations/conversation-router-static.spec.ts`
- [X] T042 [P] [US8] Add e2e tests for greeting and system-command send-message flows with no RAG/LLM calls in `02-BACKEND/tests/e2e/conversations/conversation-static-routes.e2e-spec.ts`

### Implementation for User Story 8

- [X] T043 [US8] Implement deterministic system-command and static-response detection in `02-BACKEND/src/modules/conversations/conversation-router.service.ts`
- [X] T044 [US8] Implement bounded static greeting, thanks, product scope, and help response copy in `02-BACKEND/src/modules/conversations/conversation-static-responses.ts`
- [X] T045 [US8] Integrate static and system-command routes into send-message processing after safety and before follow-up/RAG in `02-BACKEND/src/modules/conversations/conversation-message.service.ts`

**Checkpoint**: Static and system-command paths are independently functional and do not call RAG or LLM.

---

## Phase 6: User Story 6 - Safety Messages Follow Established Safety Path (Priority: P1)

**Goal**: Safety-sensitive messages run through the existing deterministic Safety module before all other routes and persist deterministic safety outcomes or fail closed.

**Independent Test**: Send safety fixtures and verify route `SAFETY`, completed deterministic response for handled safety cases, failed fixed fallback for Safety Check technical failure, and no RAG/LLM calls.

### Tests for User Story 6

- [X] T046 [P] [US6] Add unit tests for safety precedence, safety success mapping, and Safety Check technical failure stop-processing behavior in `02-BACKEND/tests/unit/conversations/conversation-safety-routing.spec.ts`
- [X] T047 [P] [US6] Add e2e tests for safety override as `COMPLETED`/`SAFETY` and Safety Check technical failure as `FAILED`/`SAFETY` in `02-BACKEND/tests/e2e/conversations/conversation-safety.e2e-spec.ts`

### Implementation for User Story 6

- [X] T048 [US6] Add conversation safety adapter that calls existing deterministic Safety module behavior without creating a second safety authority in `02-BACKEND/src/modules/conversations/conversation-safety.service.ts`
- [X] T049 [US6] Persist successful safety assistant messages with `status = COMPLETED`, `route = SAFETY`, and relevant metadata linkage in `02-BACKEND/src/modules/conversations/conversation-message.service.ts`
- [X] T050 [US6] Persist Safety Check technical failures with `status = FAILED`, route/stage `SAFETY`, sanitized metadata, and fixed emergency/trusted-person fallback in `02-BACKEND/src/modules/conversations/conversation-message.service.ts`
- [X] T051 [US6] Add safety-content log redaction assertions for conversation processing metadata in `02-BACKEND/tests/e2e/conversations/conversation-safety-redaction.e2e-spec.ts`

**Checkpoint**: Safety route takes precedence over commands, static responses, follow-up rewrite, RAG, and LLM.

---

## Phase 7: User Story 3 - Answer Knowledge and Coaching Questions Using RAG Sources (Priority: P1)

**Goal**: Substantive coaching or knowledge messages route to RAG by default, use retrieved evidence, generate grounded answers, validate citations, and persist stable source snapshots.

**Independent Test**: Use a controlled RAG fixture returning relevant chunks and a fake LLM that cites those chunks; verify the prompt boundary, persisted answer, and persisted citations match supplied chunks.

### Tests for User Story 3

- [X] T052 [P] [US3] Add contract tests for backend-to-RAG `/v1/search` request mapping, response chunk metadata mapping, health/error mapping, timeout handling, and no direct Qdrant dependency in `02-BACKEND/tests/contract/conversations/conversation-rag.contract.spec.ts`
- [X] T053 [P] [US3] Add unit tests for grounded prompt assembly boundaries and untrusted retrieved document text handling in `02-BACKEND/tests/unit/conversations/conversation-prompt-builder.spec.ts`
- [X] T054 [P] [US3] Add unit tests for citation mapping, unknown chunk rejection, page-range support, and fallback display metadata in `02-BACKEND/tests/unit/conversations/conversation-citation-mapper.spec.ts`
- [X] T055 [P] [US3] Add e2e tests for normal RAG answer with citations and persisted source fields matching retrieved chunks in `02-BACKEND/tests/e2e/conversations/conversation-rag-answer.e2e-spec.ts`

### Implementation for User Story 3

- [X] T056 [US3] Implement authenticated conversation RAG HTTP client for Python `POST /v1/search`, `GET /v1/health`, timeout handling, and normalized statuses in `02-BACKEND/src/modules/conversations/rag/conversation-rag-client.service.ts`
- [X] T057 [US3] Implement backend retrieval sufficiency policy for result count, score threshold, duplicate/invalid chunk exclusion, and context budget in `02-BACKEND/src/modules/conversations/conversation-grounding.service.ts`
- [X] T058 [US3] Implement prompt builder separating product instructions, bounded recent history, current user message, standalone retrieval query, and untrusted retrieved chunks in `02-BACKEND/src/modules/conversations/conversation-prompt-builder.ts`
- [X] T059 [US3] Implement citation mapper that accepts only chunks supplied to the LLM and creates assistant source snapshots in `02-BACKEND/src/modules/conversations/conversation-citation-mapper.ts`
- [X] T060 [US3] Implement conversation grounded-answer LLM adapter integration through `ConversationAiPort` in `02-BACKEND/src/modules/ai/conversation-llm.adapter.ts`
- [X] T061 [US3] Integrate RAG retrieval, prompt building, LLM generation, citation validation, assistant persistence, and source persistence into `02-BACKEND/src/modules/conversations/conversation-message.service.ts`

**Checkpoint**: RAG answer path is independently functional with grounded citations and Python remaining retrieval-only.

---

## Phase 8: User Story 4 - Resolve Follow-Up Questions Using Recent Context (Priority: P1)

**Goal**: Deterministic follow-up detection identifies ambiguous dependent messages; sufficient context is rewritten to a standalone retrieval query; insufficient context and rewrite technical failure produce distinct persisted outcomes without calling RAG.

**Independent Test**: Seed prior messages, send clear and ambiguous fixtures, and verify original text preservation, rewritten-query metadata, no rewrite for clear messages, no RAG on insufficient context, and no RAG on technical rewrite failure.

### Tests for User Story 4

- [X] T062 [P] [US4] Add unit tests for deterministic follow-up detection fixtures and clear-query passthrough in `02-BACKEND/tests/unit/conversations/conversation-follow-up-detector.spec.ts`
- [X] T063 [P] [US4] Add unit tests for bounded recent history selection and no summary/long-term-memory behavior in `02-BACKEND/tests/unit/conversations/conversation-context-window.spec.ts`
- [X] T064 [P] [US4] Add e2e tests for rewrite success, stored standalone query, insufficient-context `COMPLETED` clarification, and rewrite technical failure `FAILED` outcome in `02-BACKEND/tests/e2e/conversations/conversation-follow-up.e2e-spec.ts`

### Implementation for User Story 4

- [X] T065 [US4] Implement deterministic follow-up detector for short dependent questions, pronoun references, explicit previous-discussion references, and low-standalone-meaning messages in `02-BACKEND/src/modules/conversations/conversation-follow-up-detector.ts`
- [X] T066 [US4] Implement bounded recent conversation context loader with latest 10 messages and character-budget trimming in `02-BACKEND/src/modules/conversations/conversation-context.service.ts`
- [X] T067 [US4] Implement follow-up rewrite provider call through `ConversationAiPort` with timeout and malformed-output normalization in `02-BACKEND/src/modules/conversations/conversation-follow-up-rewrite.service.ts`
- [X] T068 [US4] Integrate follow-up query selection into send-message processing after safety/static/system routes and before RAG in `02-BACKEND/src/modules/conversations/conversation-message.service.ts`
- [X] T069 [US4] Persist rewritten standalone retrieval query, `INSUFFICIENT_CONTEXT` reason, and `FOLLOW_UP_REWRITE` technical failure metadata in `02-BACKEND/src/modules/conversations/conversation-message.repository.ts`

**Checkpoint**: Follow-up handling is independently functional without summaries, route classification, or automatic re-citation of previous sources.

---

## Phase 9: User Story 5 - Insufficient Retrieval Prevents Unsupported Claims (Priority: P1)

**Goal**: Empty or weak retrieval returns a completed insufficient-evidence answer without LLM generation; technical RAG failures return failed safe technical responses.

**Independent Test**: Configure RAG fixtures for empty results, low scores, timeout, unavailable, and malformed data and verify correct completed-vs-failed outcomes and no unsupported claims.

### Tests for User Story 5

- [X] T070 [P] [US5] Add unit tests for empty retrieval, low-score retrieval, duplicate chunk filtering, invalid metadata filtering, and no LLM call on insufficient grounding in `02-BACKEND/tests/unit/conversations/conversation-retrieval-outcomes.spec.ts`
- [X] T071 [P] [US5] Add e2e tests for insufficient retrieval as `COMPLETED`/`RAG` with empty sources and RAG technical failure as `FAILED`/`RAG` in `02-BACKEND/tests/e2e/conversations/conversation-insufficient-retrieval.e2e-spec.ts`

### Implementation for User Story 5

- [X] T072 [US5] Implement insufficient-evidence response builder with no therapeutic, psychological, educational, or unsupported claims in `02-BACKEND/src/modules/conversations/conversation-insufficient-evidence.ts`
- [X] T073 [US5] Map empty and weak retrieval to `COMPLETED` assistant messages with route `RAG`, empty sources, and insufficient-evidence metadata in `02-BACKEND/src/modules/conversations/conversation-message.service.ts`
- [X] T074 [US5] Map RAG timeout, unavailable, unauthorized, missing token, malformed response, and malformed chunks to `FAILED` assistant messages with safe technical fallback in `02-BACKEND/src/modules/conversations/conversation-message.service.ts`

**Checkpoint**: Retrieval insufficiency and retrieval technical failures are distinguishable and safe.

---

## Phase 10: User Story 7 - Backend Reliability When RAG or LLM Fails (Priority: P1)

**Goal**: RAG/LLM/provider/citation failures leave persisted messages in known final states, avoid duplicate assistant messages, and never leak internals.

**Independent Test**: Simulate RAG timeout/unavailable/malformed, LLM timeout/unavailable/rate limit, invalid/unsafe/uncited output, and retry after failure; verify one assistant failure message and stored-result replay.

### Tests for User Story 7

- [X] T075 [P] [US7] Add unit tests for LLM error normalization, invalid output rejection, unsafe output rejection, and unsupported citation rejection in `02-BACKEND/tests/unit/conversations/conversation-llm-failures.spec.ts`
- [X] T076 [P] [US7] Add unit tests for sanitized failure metadata and no prompt/provider stack/secret persistence in `02-BACKEND/tests/unit/conversations/conversation-failure-metadata.spec.ts`
- [X] T077 [P] [US7] Add e2e tests for RAG failure, LLM failure, invalid provider output, duplicate retry after stored failure, and no duplicate assistant rows in `02-BACKEND/tests/e2e/conversations/conversation-failure-retry.e2e-spec.ts`

### Implementation for User Story 7

- [X] T078 [US7] Implement normalized LLM failure mapping for disabled, unavailable, timeout, rate limit, malformed output, unsafe output, and unsupported citation in `02-BACKEND/src/modules/ai/conversation-llm.adapter.ts`
- [X] T079 [US7] Implement assistant failure persistence helper that stores safe fallback content, route, processing stage, failure code, sanitized detail, and completion timestamp in `02-BACKEND/src/modules/conversations/conversation-message.repository.ts`
- [X] T080 [US7] Ensure send-message catches RAG, LLM, citation, and unexpected orchestration errors after user-message persistence and stores exactly one assistant failure in `02-BACKEND/src/modules/conversations/conversation-message.service.ts`
- [X] T081 [US7] Ensure idempotency replay returns stored failures without reprocessing and new attempts require new idempotency keys in `02-BACKEND/src/modules/conversations/conversation-idempotency.service.ts`

**Checkpoint**: Failure outcomes are reliable, idempotent, non-leaky, and safe.

---

## Phase 11: Final Integration and Cross-Cutting Verification

**Purpose**: Verify the complete backend-to-RAG integration, privacy boundaries, generated Prisma client, and optional manual smoke instructions.

- [X] T082 [P] Add real backend-to-Python-RAG fixture integration test for authenticated `/v1/search` mapping with fake LLM and no paid provider calls in `02-BACKEND/tests/integration/rag/conversation-python-rag.integration-spec.ts`
- [X] T083 [P] Add full conversation redaction audit tests for no raw message content, prompts, retrieved text, safety reasons, provider credentials, or hidden chain-of-thought in logs/metadata in `02-BACKEND/tests/e2e/conversations/conversation-redaction-audit.e2e-spec.ts`
- [X] T084 [P] Add end-to-end acceptance matrix covering all Spec 004 cross-cutting scenarios AC-X1 through AC-X9 in `02-BACKEND/tests/e2e/conversations/conversation-acceptance-matrix.e2e-spec.ts`
- [X] T085 Run Prisma generation and fix generated-client integration issues referenced by `02-BACKEND/prisma/schema.prisma` and `02-BACKEND/package.json`
- [X] T086 Run backend unit and contract tests from `02-BACKEND/package.json` and fix failures in `02-BACKEND/src/modules/conversations/`
- [X] T087 Run backend e2e tests from `02-BACKEND/package.json` and fix failures in `02-BACKEND/tests/e2e/conversations/`
- [X] T088 Update optional manual smoke instructions for the implemented endpoints and fixture setup in `specs/004-conversation-ai-rag/quickstart.md`
- [X] T089 Verify no Spec 004 task introduced frontend chatbot UI, streaming, tools/agents, `LLM_ONLY`, LLM route classifier, summaries, retry endpoint, title update endpoint, AI microservice, direct backend Qdrant access, or Python prompts/generation in `specs/004-conversation-ai-rag/tasks.md`

---

## Dependencies and Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies.
- **Phase 2 Foundational**: Depends on Phase 1 and blocks all user stories.
- **Phase 3 US1**: Depends on Phase 2.
- **Phase 4 US2**: Depends on Phase 3 because send-message requires owned active conversations.
- **Phase 5 US8**: Depends on Phase 4 because static/system routes run inside send-message; implemented early to prove no-AI routing before RAG/LLM work.
- **Phase 6 US6**: Depends on Phase 4 and should complete before RAG/LLM phases because safety precedence blocks all later routes.
- **Phase 7 US3**: Depends on Phases 4, 5, and 6 because RAG default runs after safety/static/system routing.
- **Phase 8 US4**: Depends on Phase 7 because follow-up rewrite feeds RAG retrieval and grounded answer generation.
- **Phase 9 US5**: Depends on Phase 7 because insufficient retrieval extends RAG outcome handling.
- **Phase 10 US7**: Depends on Phases 7, 8, and 9 because reliability covers RAG, rewrite, LLM, citation, and idempotent failure replay.
- **Phase 11 Final Integration**: Depends on all selected user stories.

### User Story Dependencies

- **US1 Create/View Conversations**: First MVP slice after foundation; no user-story dependencies.
- **US2 Send Message/Persist Assistant**: Requires US1 conversation ownership and lifecycle.
- **US8 Static/System Routes**: Requires US2 send-message shell; can be delivered before RAG/LLM.
- **US6 Safety Path**: Requires US2 send-message shell; must complete before RAG/LLM routing is considered complete.
- **US3 RAG With Sources**: Requires US2, US8, and US6 route ordering.
- **US4 Follow-Ups**: Requires US3 RAG path and AI provider port.
- **US5 Insufficient Retrieval**: Requires US3 RAG path.
- **US7 Reliability**: Requires RAG, rewrite, LLM, citation, and idempotency paths.

### Within Each User Story

- Tests are listed before implementation and should fail before implementation.
- DTO/schema/repository work precedes services.
- Services precede controllers and integration wiring.
- Core success path precedes failure and redaction hardening within the same story.
- Story checkpoint must pass before moving to the next dependent story.

---

## Parallel Opportunities

- Setup helper files `T004` through `T007` can run in parallel because they touch separate files.
- Foundational tests `T009` through `T011` can run in parallel before foundational implementation.
- US1 tests `T023` through `T025` can run in parallel.
- US2 tests `T032` through `T034` can run in parallel.
- US3 tests `T052` through `T055` can run in parallel.
- US4 tests `T062` through `T064` can run in parallel.
- US7 tests `T075` through `T077` can run in parallel.
- Final verification tests `T082` through `T084` can run in parallel after all stories are complete.

## Parallel Example: User Story 3

```text
Task: "T052 Add contract tests for backend-to-RAG /v1/search in 02-BACKEND/tests/contract/conversations/conversation-rag.contract.spec.ts"
Task: "T053 Add prompt assembly tests in 02-BACKEND/tests/unit/conversations/conversation-prompt-builder.spec.ts"
Task: "T054 Add citation mapper tests in 02-BACKEND/tests/unit/conversations/conversation-citation-mapper.spec.ts"
Task: "T055 Add RAG answer e2e tests in 02-BACKEND/tests/e2e/conversations/conversation-rag-answer.e2e-spec.ts"
```

## Parallel Example: User Story 4

```text
Task: "T062 Add follow-up detector tests in 02-BACKEND/tests/unit/conversations/conversation-follow-up-detector.spec.ts"
Task: "T063 Add context window tests in 02-BACKEND/tests/unit/conversations/conversation-context-window.spec.ts"
Task: "T064 Add follow-up e2e tests in 02-BACKEND/tests/e2e/conversations/conversation-follow-up.e2e-spec.ts"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 US1 and validate conversation lifecycle/ownership independently.
3. Complete Phase 4 US2 and validate persisted send-message/idempotency with fake orchestration.
4. Complete Phase 5 US8 and Phase 6 US6 before enabling any RAG/LLM route.
5. Complete Phase 7 US3 for grounded RAG answers with citations.

### Incremental Delivery

1. Lifecycle only: US1 can be demoed without AI dependencies.
2. Persistence shell: US2 proves synchronous send-message shape and idempotency.
3. Low-cost deterministic routes: US8 proves no unnecessary external calls.
4. Safety: US6 proves safety precedence and fail-closed behavior.
5. Grounded answers: US3 adds RAG/LLM/citations while Python remains retrieval-only.
6. Conversational quality: US4 adds bounded follow-up rewrite without summaries or classifiers.
7. Safety/reliability hardening: US5 and US7 lock down insufficient retrieval and failures.

### Deferred Functionality Guardrails

- Do not implement frontend chatbot UI in `03-FRONTEND/`.
- Do not implement streaming, tools/agents, `LLM_ONLY`, LLM route classifier, summaries, retry endpoint, or conversation title update endpoint in `02-BACKEND/src/modules/conversations/`.
- Do not move prompts, conversations, LLM calls, grounding sufficiency, citations, or generation into `04-RAG/`.
- Do not add direct Qdrant access from `02-BACKEND/`; use authenticated Python RAG HTTP only.
