# Quickstart: Conversation AI and RAG Orchestration

## Scope Reminder

Implement backend conversation APIs and AI/RAG orchestration only. Do not build the frontend chatbot, streaming, tools/agents, `LLM_ONLY`, route classifier, summaries, retry endpoint, conversation title updates, or an AI microservice.

## Implementation Order

1. Add Prisma conversation models and migration for `Conversation`, `ConversationMessage`, and `AssistantMessageSource`.
2. Add `ConversationsModule` with protected `/api/v1/conversations` routes for create, list, retrieve, archive/unarchive, hard delete, and send message.
3. Reuse `JwtAuthGuard` and `EmailVerifiedGuard`; add conversation eligibility checks for onboarding `COMPLETED` and not `SAFETY_HOLD`.
4. Implement owner-scoped queries so foreign conversation ids return `CONVERSATION_NOT_FOUND` without leaking data.
5. Implement send-message idempotency using `(userId, conversationId, idempotencyKey)` and at most one assistant response per user message.
6. Add deterministic route order: persist user message, safety check, system command, static greeting/thanks, deterministic follow-up detection, RAG default.
7. Add conversation AI provider ports for grounded answer generation and follow-up rewrite, with deterministic fakes for tests.
8. Add conversation RAG client mapping to Python `POST /v1/search` and normalize empty/weak, timeout, unavailable, and malformed outcomes.
9. Implement grounding/citation validation so completed RAG answers cite only chunks supplied to the LLM.
10. Add privacy-safe failure metadata, correlation id propagation, and log redaction checks.

## RAG Compatibility Decision

Conversation RAG calls should target the current Python endpoint:

```text
POST /v1/search
Authorization: Bearer <RAG_SERVICE_TOKEN>
```

Request:

```json
{
  "question": "standalone retrieval query",
  "limit": 6,
  "score_threshold": 0.7
}
```

The backend normalizes `{ "results": [...] }` into internal retrieval statuses and keeps sufficiency, prompt construction, LLM calls, and citation persistence in NestJS.

## Automated Verification

From `02-BACKEND`:

```powershell
npm run prisma:generate
npm run test
npm run test:e2e
npx vitest run "tests/integration/rag/conversation-python-rag.integration-spec.ts"
```

Required focused coverage:

- Unit tests for route order, safety precedence, static/system routes, follow-up detection, rewrite outcomes, grounding sufficiency, citation mapping, provider normalization, and idempotency.
- Contract tests for conversation API validation and backend-to-RAG `/v1/search` mapping.
- E2E tests for eligibility, ownership, create/list/retrieve/archive/delete/send, duplicate send retry, insufficient retrieval, RAG technical failure, LLM failure, safety route, and Safety Check technical failure.
- One backend-to-Python-RAG fixture integration with fake LLM and no paid provider call.

## Optional Manual Smoke

With a local backend, configured RAG service token/base URL, seeded approved RAG fixture, and optional real LLM provider:

```powershell
npm run start:dev
```

Manual path:

1. Register/login/verify a user and complete onboarding.
2. Create a conversation through `POST /api/v1/conversations`.
3. Send a greeting and verify no RAG/LLM call.
4. Send a grounded coaching question with seeded RAG chunks and verify route `RAG`, completed assistant message, and sources.
5. Send a query with empty or weak retrieval and verify a completed insufficient-evidence answer with empty sources and no LLM generation.
6. Temporarily point `RAG_BASE_URL` to an unavailable service and verify a failed `RAG` technical fallback with sanitized metadata.
7. Retry the same send with the same `X-Idempotency-Key` and verify the same stored result is returned, including stored failures.

Do not include live LLM provider smoke tests in the normal automated suite.
