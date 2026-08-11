# Boundary Hardening Phase 05: Retrieval / RAG Infrastructure Boundary

Date: 2026-08-10  
Status: Complete; Phase 06 was not started

## 1. Before Coaching RAG integration

Coaching owned `coaching/rag/rag-client.service.ts`, including its token, port, DTOs, HTTP adapter, environment reads, timeout, authentication, `/v1/search`, and broad technical-error mapping. `CoachingGroundingService` injected `RAG_CLIENT_PORT` and supplied a domain-rich request, but the adapter converted it to the actual Python request:

```json
{"question":"Coaching guidance for <focus areas>. Support area: <support>.","limit":6,"score_threshold":0.44}
```

Configuration was `RAG_BASE_URL`, `RAG_SERVICE_TOKEN`, `RAG_TIMEOUT_MS` defaulting to 5000 ms. The threshold was selected by Coaching from `RAG_SCORE_THRESHOLD` defaulting to `0.44`. The correlation ID was `coaching-<resultId>`. Missing config, timeout, fetch failures, and non-2xx responses became `RAG_UNAVAILABLE`; an empty `results` array became `INSUFFICIENT_GROUNDING`. `CoachingGroundingService` was the only production consumer.

## 2. Before Conversation RAG integration

Conversations owned `conversation-rag-client.port.ts` and `conversation-rag-client.service.ts`. The client sent the domain-built `{question, limit, score_threshold}` unchanged, used the same base URL/token/timeout configuration, set bearer and correlation headers, validated required chunk metadata, and normalized unavailable, timeout, unauthorized, and invalid-response outcomes. It also contained an unused production `health()` capability.

`ConversationMessageService` was the search consumer. Conversation-owned services retained follow-up rewrite, standalone query selection, threshold filtering, context budget, deduplication, insufficient-evidence behavior, prompt building, citation validation, failure persistence, and LLM ordering.

Pre-change focused baseline: 25 files passed, 114 tests passed.

## 3. Final Retrieval module tree

```text
src/modules/retrieval/
├── dto/
│   └── retrieval.dto.ts
├── ports/
│   └── retrieval-client.port.ts
├── services/
│   ├── retrieval-http-client.service.ts
│   └── retrieval.service.ts
├── retrieval.module.ts
└── retrieval.public.ts
```

No empty folders or domain grounding engine were added.

## 4. Final retrieval.public.ts exports

- `RetrievalService`
- `RetrievalSearchRequest`
- `RetrievalSearchResult`
- `RetrievalStatus`
- `RetrievedChunk`

The HTTP adapter, internal token/port, parser/validation implementation, and configuration details are not public.

## 5. Public Service versus internal Port decision

Consumers inject the public `RetrievalService`. One internal `RETRIEVAL_CLIENT_PORT` isolates external HTTP transport and permits deterministic delegation tests. Consumer modules neither import nor register the internal port or adapter.

## 6. Canonical request/result contract

The request deliberately preserves the Python wire names and existing request bytes:

```ts
interface RetrievalSearchRequest {
  question: string;
  limit?: number;
  score_threshold?: number;
}
```

`RetrievedChunk` contains only metadata actually returned and used: chunk/source IDs, title/file/type, text/hash, score, chunk index, page range, and citation page/heading/section. `RetrievalSearchResult` contains infrastructure status, correlation ID, ordered chunks, and an optional normalized error code.

No Coaching, Conversation, plan, LLM, or citation-presentation concepts entered the Retrieval contract.

## 7. Threshold ownership decision

Threshold policy remains domain-owned:

- Conversations passes `CONVERSATION_LIMITS.ragScoreThreshold`, sourced from `RAG_SCORE_THRESHOLD ?? 0.44`, and retains defense-in-depth filtering in `ConversationGroundingService`.
- Coaching passes `Number(process.env.RAG_SCORE_THRESHOLD ?? '0.44')` from `CoachingGroundingService`.
- Retrieval passes `score_threshold` through unchanged and supplies no threshold default.
- Python remains unchanged and applies the received external search threshold.

## 8. Config ownership decision

Retrieval now exclusively reads `RAG_BASE_URL`, `RAG_SERVICE_TOKEN`, and `RAG_TIMEOUT_MS` with the unchanged 5000 ms default. Environment names and initialization timing are unchanged. Domain threshold reads remain in Coaching and Conversations.

## 9. HTTP transport migration

`RetrievalHttpClientService` now exclusively owns base URL normalization, `POST /v1/search`, bearer authentication, JSON content type, `X-Correlation-Id`, abort timeout, status handling, JSON parsing, and chunk validation. Coaching and Conversations contain no direct Python HTTP transport.

## 10. Error normalization decision

Retrieval normalizes only infrastructure outcomes:

- abort: `timeout` / `RAG_TIMEOUT`
- missing config, fetch/JSON exception, or non-2xx: `unavailable` / `RAG_UNAVAILABLE`
- 401: `unavailable` / `RAG_UNAUTHORIZED`
- structurally malformed successful response: `invalid_response` / `RAG_INVALID_RESPONSE`

This preserves the old Conversation behavior where invalid JSON thrown by `response.json()` was caught as unavailable. Weak or empty evidence remains a successful transport result and is handled by each domain.

## 11. Conversation migration details

`ConversationsModule` imports `RetrievalModule`; it no longer registers a Conversation RAG adapter/token. `ConversationMessageService` injects `RetrievalService` and sends the same standalone query, limit, threshold, and correlation ID. Conversation grounding, filtering, context limits, citation mapping, failure metadata, insufficient evidence, follow-up ordering, LLM bypass/calls, idempotency, and persistence remain in Conversations and were not changed.

## 12. Coaching migration details

`CoachingModule` imports `RetrievalModule`; it no longer registers its RAG adapter/token. `CoachingGroundingService` constructs the exact query previously constructed inside its adapter, passes limit 6 and the unchanged threshold, then builds the same grounding bundle. Technical outcomes still map to `RAG_UNAVAILABLE`; an empty successful result still maps to `INSUFFICIENT_GROUNDING` and existing `PLAN_UNAVAILABLE` behavior.

## 13. Old RAG files removed or retained

Removed because their transport and contract responsibilities moved completely into Retrieval:

- `coaching/rag/rag-client.service.ts`
- `conversations/rag/conversation-rag-client.port.ts`
- `conversations/rag/conversation-rag-client.service.ts`

No production RAG file remained in those folders. `tests/helpers/fake-conversation-rag-client.ts` was retained by filename to avoid unrelated E2E churn, but now implements the public Retrieval request/result shape and contains no old port, health method, transport, or provider ownership.

## 14. AI chunk-mapping decision

AI remains independent of Retrieval. Conversation-owned orchestration passes the structurally compatible minimal chunk fields required by AI and retains richer Retrieval metadata for citation mapping. Coaching maps Retrieval chunks into its existing grounding bundle. AI imports no Retrieval, Coaching, or Conversations source.

## 15. Retrieval unit/contract test results

The migrated focused run passed 25 files and 118 tests. New Retrieval tests cover success, exact URL/path, auth headers, exact payload, threshold/limit passthrough, correlation ID, ordered chunk mapping, timeout, missing config, unavailable service, unauthorized response, invalid JSON, missing results, malformed chunks, no retry, exactly one HTTP request, and one public-service delegation.

## 16. Conversation regression results

All Conversation unit and contract coverage in the focused run passed. All Conversation E2E suites passed in the combined runtime run. Coverage proved request count/order, standalone-query behavior, threshold, chunk selection, insufficient evidence, `RAG_UNAVAILABLE`/`RAG_TIMEOUT`/`RAG_INVALID_RESPONSE`, failure stage/detail, citations, LLM ordering/bypass, idempotency, and duplicate-message prevention.

## 17. Coaching regression results

Coaching unit/contract coverage passed, including exact Retrieval request characterization. Coaching plan and Coaching RAG plan E2E passed, covering grounding bundle/citations, failure closure, LLM behavior, graph persistence, retries, lifecycle, safety, isolation, and returning plans.

## 18. Backend-to-Python integration validation

The existing file is `tests/integration/rag/conversation-python-rag.integration-spec.ts`. It is included by `vitest.config.e2e.ts`, not the default unit/contract config. It was migrated to `RetrievalHttpClientService` and executed explicitly. The mocked Python boundary proved authenticated `/v1/search`, correlation-capable transport, request mapping, and chunk response mapping without a live Python dependency. The Python service was not modified.

Combined E2E/integration result: 14 files passed, 37 tests passed.

## 19. Build and typecheck results

- `npx tsc --noEmit -p tsconfig.build.json`: passed
- `npx nest build`: passed

## 20. Scoped lint

Retrieval plus affected Coaching, Conversations, helpers, integration, and contract tests: passed.

## 21. Project-wide lint

`npx eslint .`: passed.

## 22. git diff --check

Passed. Existing LF-to-CRLF working-copy notices were emitted; no whitespace errors were reported.

## 23. RAG transport ownership scan

Production scans for `RAG_BASE_URL`, `RAG_SERVICE_TOKEN`, `RAG_TIMEOUT_MS`, and `/v1/search` found no matches outside `src/modules/retrieval`. Obsolete production clients, tokens, and imports were absent.

## 24. Direct Qdrant access scan

Production backend source and `package.json` contained no `qdrant`, `query_points`, or `QdrantClient` match. NestJS has no direct Qdrant dependency or access.

## 25. Dependency graph before and after

Before:

```text
Coaching -> Coaching RAG port/HTTP client -> Python
Conversations -> Conversation RAG port/HTTP client -> Python
```

After:

```text
Coaching ------> RetrievalModule -> RetrievalService -> internal port -> HTTP adapter -> Python
Conversations -> RetrievalModule -> RetrievalService -> internal port -> HTTP adapter -> Python

Retrieval -X-> Coaching
Retrieval -X-> Conversations
Retrieval -X-> AI
```

## 26. Cycle and forwardRef scan

Retrieval contains no imports from Coaching, Conversations, or AI. No `forwardRef()` exists in the Retrieval/Coaching/Conversations graph. No source or module cycle was introduced.

## 27. Exact proof effective thresholds did not change

Conversation E2E still asserts `{ question: 'What is grounding?', limit: 6, score_threshold: 0.44 }`. Conversation domain filtering still compares every chunk against `CONVERSATION_LIMITS.ragScoreThreshold`. The new Coaching characterization asserts `score_threshold: 0.44`. The Retrieval passthrough test proves the adapter serializes the supplied value unchanged and adds no default.

## 28. Exact proof retrieval request counts did not change

The Retrieval transport test asserts exactly one `fetch` per `search()` and timeout/unavailable tests prove no silent retry. The public service test asserts exactly one internal client call. Conversation unit/E2E assertions continue to prove one call on the grounded path and zero calls for safety/static/idempotent/insufficient-context bypasses. The Coaching characterization asserts one Retrieval call per assembly.

## 29. Exact proof Conversation behavior did not change

The same message orchestration implementation remains responsible for rewrite before retrieval, one search, domain filtering, insufficient-evidence completion, RAG-stage technical failures, LLM invocation only after sufficient chunks, citation validation, and persistence. Focused tests passed with the same expected warning-stage/error codes, and every Conversation E2E suite passed. No HTTP DTO, route, persistence, status, error code, prompt, or call-count behavior changed.

## 30. Exact proof Coaching behavior did not change

The exact old adapter query was moved mechanically into `CoachingGroundingService` and is directly asserted. Limit 6, threshold 0.44, correlation `coaching-result-1`, ordered chunk IDs, content-gate ordering, failure closure, LLM invocation, and graph persistence are covered by passing unit/contract/E2E tests. No Coaching DTO, route, lifecycle, prompt, content policy, or persistence code changed.

## 31. Remaining issues intentionally deferred

- Profile ownership hardening
- Assessment lifecycle ownership
- Safety-to-Assessment state writes
- Retention ownership
- final automated boundary-enforcement hardening
- any broader test-config redesign
- any Python/Qdrant/ingestion changes

The removed Conversation `health()` method had no production consumer; future operational health capability should be added deliberately at the Retrieval boundary if required. Phase 06 was not started.

## Console summary

Phase 05 created one infrastructure-only Retrieval boundary, migrated Coaching and Conversations without changing domain grounding policy, removed both duplicate HTTP clients, preserved the effective 0.44 thresholds and one-request behavior, and passed focused tests (25 files/118 tests), E2E plus integration (14 files/37 tests), typecheck, build, lint, static ownership scans, and diff checks. Work stopped before Phase 06.
