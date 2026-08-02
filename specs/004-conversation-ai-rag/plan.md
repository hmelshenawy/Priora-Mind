# Implementation Plan: Conversation AI and RAG Orchestration

**Branch**: `004-conversation-ai-rag` | **Date**: 2026-08-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-conversation-ai-rag/spec.md`

## Summary

Spec 004 adds backend-owned conversation lifecycle, message persistence, deterministic routing, AI orchestration, and grounded answer generation for future chatbot UI consumption. NestJS remains the product boundary: it owns conversations, safety coordination, prompts, LLM calls, grounding decisions, citations, idempotency, and failure states. Python RAG remains retrieval-only and is consumed through authenticated HTTP.

The implementation should extend the existing modular NestJS backend with `conversations` and logical AI orchestration code, reuse the current auth/email/onboarding/safety patterns, persist conversation/message/source data in PostgreSQL via Prisma, and adapt conversational retrieval to the currently implemented Python `POST /v1/search` endpoint. No frontend chatbot, streaming, tools/agents, `LLM_ONLY`, LLM route classifier, summaries, AI microservice, or RAG ingestion redesign is part of this MVP.

## Technical Context

**Language/Version**: TypeScript 5.9 with NestJS 11 for `02-BACKEND`; Python 3.x with FastAPI for existing `04-RAG`; Prisma Client 6.

**Primary Dependencies**: NestJS, Prisma, PostgreSQL, Zod validation, Vitest, Supertest, existing JWT/email-verified guards, existing Safety module, existing provider-neutral AI direction, FastAPI RAG service, Qdrant behind the RAG service only.

**Storage**: PostgreSQL through Prisma for conversations, messages, and assistant source snapshots. Python RAG keeps vector/chunk metadata in Qdrant; backend must not connect directly to Qdrant.

**Testing**: Vitest unit, contract, integration, and e2e tests under `02-BACKEND/tests`; deterministic fake LLM and fake RAG clients for normal automation; one real backend-to-Python-RAG fixture integration without paid LLM calls.

**Target Platform**: Backend web service in the existing modular monolith, exposed under `/api/v1`; internal authenticated HTTP from backend to Python RAG.

**Project Type**: Web-service backend feature with an internal service integration. No frontend implementation in this spec.

**Performance Goals**: Synchronous send-message flow completes within configured safety, RAG, and LLM timeouts; retrieval context is bounded by result count, score threshold, and context character/token budget; retries with the same idempotency key avoid duplicate work after a stored final state.

**Constraints**:

- Normal conversation APIs require authenticated, email-verified users with onboarding `COMPLETED` and not `SAFETY_HOLD`.
- Safety evaluation happens after user-message persistence and before commands, static responses, follow-up rewrite, RAG, or LLM generation.
- MVP routes are limited to `SAFETY`, `SYSTEM_COMMAND`, `STATIC_RESPONSE`, and `RAG`.
- Every substantive coaching, psychological, educational, or knowledge-dependent message routes to RAG by default.
- Empty/weak retrieval is a completed insufficient-evidence outcome; RAG timeout/unavailable/malformed is a failed technical outcome.
- Conversation context is bounded recent history only; no summaries or long-term memory.
- Raw message content, prompts, retrieved text, safety reasons, provider secrets, and stack traces must not appear in normal logs or persisted failure metadata.

**Scale/Scope**: One backend conversation module, one logical backend AI orchestration boundary, one Prisma schema extension, current Python RAG search API integration, and tests covering all Spec 004 P1/P2 acceptance paths.

## Constitution Check

| # | Principle | Status | MVP Alignment |
|---|-----------|--------|---------------|
| I | Coaching, Not Clinical Care | Pass | Grounded answers remain coaching/wellness scoped and cannot diagnose, treat, prescribe, or provide emergency care. |
| II | Safety Before Coaching | Pass | Safety runs first and fails closed; high-risk/crisis responses do not depend on RAG or LLM. |
| III | Evidence-Grounded and Bounded AI | Pass | RAG is default for substantive content; insufficient evidence blocks unsupported generation. |
| IV | Domain Ownership and Human-Controlled AI | Pass | Conversations own persistence, Safety owns deterministic safety, AI owns orchestration, RAG owns retrieval only. |
| V | Structured Coaching Experience | Pass | Conversations, messages, routes, states, and citations have explicit lifecycle and API contracts. |
| VI | Privacy, Data Isolation, User Control | Pass | Owner isolation, minimal provider context, deletion alignment, and redacted logging are required. |
| VII | Explicit and Limited Context and Memory | Pass | Only bounded recent messages are used; no summaries or long-term memory in MVP. |
| VIII | Clean, Modular, Maintainable Code | Pass | Uses NestJS modules, ports, fakes, and provider-neutral boundaries; no AI microservice extraction now. |
| IX | Testing and Verifiable Behavior | Pass | Unit, contract, integration, e2e, fake dependency, and real RAG fixture tests are required. |
| X | Arabic and English Quality Equality | Pass | API preserves user content and citation metadata; language behavior follows configured/current-message context. |
| XI | Authoritative Project References | Pass | Aligns with Specs 001-003, PRD, SAD, Frontend Architecture, and current RAG implementation. |
| XII | Simplicity and MVP Discipline | Pass | Excludes streaming, classifier routing, tools, summaries, retry endpoint, title updates, and frontend UI. |

## Reference Alignment

- **PRD.md**: Supports AI chat, personalized coaching support, evidence-based knowledge, privacy, safety boundaries, and Arabic/English product direction while preserving the non-clinical positioning.
- **SAD.md**: Aligns with the modular-monolith backend, provider-independent AI, module ownership, authenticated backend-to-RAG integration, no frontend/RAG direct access, and no direct backend Qdrant dependency.
- **Frontend_Architecture.md**: No frontend code is included. The `/api/v1/conversations` contracts provide stable conversation, message, status, route, and source objects for the future Spec 005 chatbot.
- **Conflicts / Gaps**: Existing Spec 003/backend code references `/v1/retrieval/query`, while the implemented Python service exposes `/v1/search`. Spec 004 resolves conversation RAG by adapting the conversation RAG client to the current `/v1/search` endpoint and normalizing responses in the backend. This does not move prompts, conversations, sufficiency, citations, or generation into Python.

## Phase 0 Research Decisions

See [research.md](./research.md). Key decisions:

- Use a new backend Conversations module with Prisma-owned conversation/message/source models.
- Keep AI orchestration inside the backend as a logical module/boundary, not a separate deployable service.
- Adapt conversational RAG to `POST /v1/search` and normalize outcomes in the backend.
- Use deterministic route order and deterministic follow-up detection before any rewrite LLM call.
- Persist one user message and at most one assistant message per idempotent send attempt.

## Phase 1 Design Artifacts

- [data-model.md](./data-model.md): Conversation, message, source, route/state, idempotency, and transition model.
- [contracts/conversation-ai-api.md](./contracts/conversation-ai-api.md): Backend API, RAG boundary, LLM boundary, follow-up rewrite boundary, and fixed fallbacks.
- [quickstart.md](./quickstart.md): Implementation and verification guide.

## Project Structure

### Documentation (this feature)

```text
specs/004-conversation-ai-rag/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── conversation-ai-api.md
└── tasks.md          # generated later by /speckit-tasks
```

### Source Code (repository root)

```text
02-BACKEND/
├── prisma/
│   └── schema.prisma              # add conversation/message/source models and migration
├── src/
│   ├── modules/
│   │   ├── conversations/         # new API, ownership, persistence, idempotency, orchestration entrypoint
│   │   ├── ai/                    # extend provider-neutral conversation LLM/rewrite/prompt boundary
│   │   ├── safety/                # reuse deterministic safety behavior and fail-closed semantics
│   │   └── coaching/rag/          # reuse or split RAG client conventions; conversation client targets /v1/search
│   └── common/                    # reuse filters, validation, logging/redaction, correlation patterns
└── tests/
    ├── unit/                      # router, follow-up, grounding, citation, provider normalization, idempotency
    ├── contract/                  # conversation API and backend-to-RAG search/health mapping
    └── e2e/                       # ownership, eligibility, send-message, safety/RAG/LLM outcomes

04-RAG/
└── src/priora_rag/                # existing retrieval-only FastAPI service; no prompts or generation
```

**Structure Decision**: Implement Spec 004 in the existing backend modular monolith. Add `02-BACKEND/src/modules/conversations` as the public API and persistence owner. Extend or add backend AI provider ports under `02-BACKEND/src/modules/ai` for conversation answer generation and follow-up rewrite. Keep Python RAG unchanged unless later implementation requires a small compatibility endpoint; the planned conversation path is backend adaptation to `/v1/search`.

## Complexity Tracking

No constitution gate violations. The chosen design is the minimal path that preserves module ownership and current service boundaries.

## Post-Design Constitution Check

No gate failures after Phase 1 design. The plan remains within MVP scope, preserves safety and privacy boundaries, keeps RAG retrieval-only, and provides testable contracts for the future frontend.
