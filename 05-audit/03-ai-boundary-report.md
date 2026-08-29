# Boundary Hardening Phase 03 — AI Public Boundary and Contract Ownership

**Date:** 2026-08-10  
**Scope:** AI ownership, public contracts, and Coaching/Conversation consumers only  
**Behavior changes:** None

## 1. Before AI public surface

AI had no intentional public entry point. `AiModule` registered only `CoachingLlmAdapter` and exported a Coaching-owned `COACHING_LLM_PORT`. Conversations bypassed `AiModule`, imported `ConversationLlmAdapter`, and registered both the concrete adapter and `CONVERSATION_AI_PORT` itself.

Production deep imports were:

| Consumer | Symbol | Path/type |
|---|---|---|
| Coaching | `normalizeConversationLlmError` | `ai/utils` helper |
| Coaching | `COACHING_PLAN_PROMPT_TEMPLATE` | AI constant |
| Conversations | Conversation AI token/port/request/result/history types | `ai/ports` |
| Conversations | `ConversationLlmAdapter` | concrete `ai/services` implementation |
| Conversations | `normalizeConversationLlmError` | re-export from concrete adapter |

Reverse ownership was also present:

- AI imported `COACHING_LLM_PORT`, `CoachingLlmPort`, `GroundingBundle`, `LlmPlanOutput`, and `LlmPlanResult` from Coaching.
- AI's Conversation port imported `ConversationRagChunk` from Conversations.

### Baseline

The pre-change single-worker focused baseline passed: **15 files / 120 tests** covering all AI tests, Conversation message/failure/retrieval/context/citation/prompt behavior, Coaching generation/grounding, and both Coaching/Conversation contracts.

## 2. After AI public surface

Added `src/modules/ai/ai.public.ts` as the only production consumer entry point. `AiModule` now owns and exports both runtime AI tokens. Coaching and Conversations import `AiModule` and consumer-facing contracts from AI; AI imports no source from either domain.

Concrete adapters, provider implementations, schemas, response parsers, and internal error utilities remain private.

## 3. Coaching LLM contract ownership

Before: `coaching/ports/coaching-llm.port.ts` owned the token and provider interaction contract while AI implemented it.

After: the contract lives at `ai/ports/coaching-llm.port.ts`. AI owns:

- `COACHING_LLM_PORT`
- `CoachingLlmPort`
- `GroundingBundle`
- `LlmPlanOutput`
- `LlmPlanResult`
- minimal structural bilingual/library input types used by `GroundingBundle`

The old Coaching port file was removed. Coaching still owns grounding policy, content selection, validation, lifecycle, and persistence.

## 4. Conversation AI runtime wiring

Before, `ConversationsModule` provided `ConversationLlmAdapter` and aliased `CONVERSATION_AI_PORT` locally.

After, `ConversationsModule` imports `AiModule`. `AiModule` provides `ConversationLlmAdapter`, aliases it to `CONVERSATION_AI_PORT`, and exports the token. No duplicate provider remains in Conversations.

## 5. AI → Coaching dependencies removed

AI source contains zero imports from Coaching. The coaching adapter, fake adapter, and coaching plan schema now import the AI-owned port locally.

The Coaching prompt was moved out of AI, eliminating the final domain-content dependency ambiguity.

## 6. AI → Conversations dependencies removed

AI's Conversation contract now declares the minimal `GroundedChunk` it needs:

```text
chunk_id, source_id, text_hash, text
```

It no longer imports `ConversationRagChunk`. Conversation retrieval chunks are structurally compatible and retain all additional retrieval metadata inside Conversations. No Retrieval module was created and no RAG behavior changed.

## 7. Consumer deep imports removed

Production scan outside AI for `ai/services`, `ai/providers`, `ai/utils`, `ai/dto`, or `ai/ports` returned **zero matches**.

All Coaching and Conversation production consumers use `ai/ai.public`. Module composition continues to import `ai/ai.module`, as intended.

## 8. Final `ai.public.ts` exports

Coaching capability:

- `COACHING_LLM_PORT`
- `CoachingLlmPort`
- `GroundingBundle`
- `LlmPlanOutput`
- `LlmPlanResult`

Conversation capability:

- `CONVERSATION_AI_PORT`
- `ConversationAiPort`
- `ConversationHistoryItem`
- `GroundedAnswerRequest`, `GroundedAnswerResult`, `GroundedChunk`
- `FollowUpRewriteRequest`, `FollowUpRewriteResult`

Stable failure contract:

- `ConversationLlmError`
- `AiFailureCode`
- `normalizeAiFailureCode`

No adapter, provider, schema validator, provider-response parser, diagnostics helper, or provider-specific contract is exported.

## 9. `AiModule` changes

Providers now include:

- `CoachingLlmAdapter`
- `ConversationLlmAdapter`
- `COACHING_LLM_PORT -> useExisting CoachingLlmAdapter`
- `CONVERSATION_AI_PORT -> useExisting ConversationLlmAdapter`

Exports are exactly the two tokens. Concrete implementations remain internal.

## 10. Types moved and why

- Coaching provider request/result types moved to AI because they describe the LLM boundary implemented by AI.
- `GroundedChunk` was introduced inside the AI Conversation contract to remove AI's dependency on a Conversations-owned retrieval type. It contains only fields serialized into the provider request.
- AI-local structural bilingual/library types replace imports from Coaching constants. They describe serialized provider input without transferring Coaching content ownership.
- No types moved to a global shared package.

## 11. Prompt ownership

`COACHING_PLAN_PROMPT_TEMPLATE` now lives at `coaching/constants/coaching-plan.prompt.ts` because it expresses Coaching plan composition and domain policy. The constant's version and all instruction strings were copied byte-for-byte. `CoachingGroundingService` continues to place the same version/instruction array into the same `GroundingBundle` fields.

Provider-specific formatting and schema instructions remain inside AI adapters/providers.

## 12. Error-normalization ownership

Provider adapters continue to normalize transport/provider failures internally. Consumers also need stable normalization for substituted/fake port implementations and orchestration catches, so AI exposes a deliberately named stable boundary function, `normalizeAiFailureCode`, plus `AiFailureCode` and `ConversationLlmError`.

The implementation remains the existing normalizer; its mappings are unchanged. Consumers no longer import the internal utility or adapter re-export.

The previous `no-useless-catch` in the Ollama provider wrapped only `response.text()` and immediately rethrew the identical error. It was removed. The same outer provider catch still receives and categorizes the same raw rejection, so diagnostics and failure codes are unchanged.

## 13. Provider behavior parity

No provider constructor, endpoint, header, authentication, model selection, timeout, request body, request count, `think: false`, response parsing, usage mapping, or fallback branch changed.

The only provider-body edit removed an identity try/catch around `response.text()`. Raw errors propagate to the same surrounding catch.

All AI provider/adapter unit tests and all downstream regressions passed.

## 14. Structured-output parity

The Coaching plan schema, grounded-answer schema, and follow-up rewrite schema were not edited. Required fields, `additionalProperties: false`, minimum lengths/items, local/cloud validation, fenced JSON handling, and invalid-output failure mapping remain unchanged.

The Coaching prompt content was relocated without text changes. No silent repair, retry, or second provider call was introduced.

## 15. AI unit/provider results

All tests under `tests/unit/ai/**` passed within the post-change focused run. This covers provider substitution, Ollama Cloud behavior, local/cloud schema handling, Conversation adapter behavior, and Coaching adapter behavior.

Post-change focused result: **16 files / 126 tests passed**.

## 16. Conversation regression results

The 126-test focused run included:

- 20-test `ConversationMessageService` characterization suite
- Conversation AI failures
- retrieval outcomes and context window
- citation and prompt builders
- Conversation API/message contracts
- all AI-owned Conversation adapter/provider tests

The e2e run included every file under `tests/e2e/conversations`: follow-up, RAG answer, insufficient retrieval, failure retry, citation behavior, safety, redaction, send, lifecycle, static routes, and acceptance matrix.

E2E result with Coaching suites: **13 files / 36 tests passed**.

Processing stages, failure codes, provider/model metadata, citations, idempotency, and call-count assertions remained green.

The Python RAG integration file is not included by either repository Vitest configuration; a direct default-config invocation reported “No test files found.” It was not treated as a product failure. Retrieval behavior was not changed.

## 17. Coaching regression results

The focused run covered Coaching adapter, generation, grounding, plan validation, and contract tests. The e2e run covered `coaching-plan.spec.ts` and `coaching-rag-plan.e2e-spec.ts`.

All passed. `PLAN_UNAVAILABLE` mapping, structured output, prompt content, validation, metadata, persistence, and retryability were preserved.

## 18. Build/typecheck

- `npx tsc --noEmit -p tsconfig.build.json` → **PASS**.
- `npx nest build` → **PASS**.

## 19. Scoped lint

ESLint over all AI source plus affected Coaching and Conversation source → **PASS**, zero errors/warnings.

New public/contract/prompt files also pass Prettier checks. Existing changed consumer files were not bulk-formatted because they contain unrelated in-progress work.

## 20. Project-wide lint

`npx eslint .` → **PASS**, exit 0.

The former AI `no-useless-catch` error is resolved by the behavior-neutral identity-catch removal.

## 21. `git diff --check`

Result: **PASS**, exit 0. Windows LF-to-CRLF notices are informational; no whitespace errors were reported.

## 22. Dependency graph before/after

Before:

```text
Coaching -> AiModule
AI -> Coaching LLM contract
Conversations -> AI port + concrete adapter
AI -> Conversations RAG type
```

After:

```text
CoachingModule ------> AiModule ------> Ollama/OpenAI
ConversationsModule -> AiModule ------> Ollama/OpenAI

AI -> no Coaching source
AI -> no Conversations source
```

## 23. Cycle proof

- AI domain-import scan: zero Coaching/Conversations imports.
- Outside-AI deep-import scan: zero internal AI imports.
- `forwardRef` scan across AI, Coaching, and Conversations: zero matches.
- Typecheck, Nest build, module-compiling contract tests, and e2e application tests all pass.

No Nest, source, or reverse type cycle was introduced.

## 24. Deferred AI boundary issues

- Retrieval consolidation remains deferred; Conversation and Coaching RAG clients were not moved.
- The public error function retains the existing Conversation-prefixed internal implementation name behind its `normalizeAiFailureCode` alias. Renaming internals is unnecessary for this boundary.
- White-box AI tests may continue importing AI internals; production and consumer tests use the public boundary where applicable.
- Assessment Result API, Profile, Assessment lifecycle, and Retention ownership phases were not started.

## 25. Product behavior confirmation

No HTTP API, Conversation orchestration branch, Coaching generation lifecycle, prompt byte content, schema, provider configuration, model, timeout, RAG behavior, citation rule, Safety behavior, persistence operation, failure code, retry policy, or provider call count changed.

Phase 03 changed ownership, import paths, and Nest registration only, plus removal of one identity catch. Phase 04 Assessment Result Boundary Hardening was not begun.

## Console summary

Phase 03 complete: AI owns both LLM contracts and runtime registrations; Coaching and Conversations use `ai.public`/`AiModule`; zero AI reverse domain imports and zero consumer deep imports remain; 126 focused tests and 36 e2e tests passed; typecheck, build, scoped lint, project lint, and diff-check all passed; no provider or product behavior changed.
