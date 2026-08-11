# Conversation Module Structural Refactor — Final Report

Spec: Conversation Module structural refactor (behavior-preserving). Branch `006-home-dashboard`.
Date: 2026-08-09. Author: refactor pass following the architecture audit (`05-audit/conversation-module-architecture-audit.md`) and the pre-refactor characterization baseline (`tests/unit/conversations/services/conversation-message-send.spec.ts`).

---

## 1. Summary

The Conversation Module (`src/modules/conversations/**`) was restructured into conventional NestJS folders — `controllers/`, `services/`, `repositories/`, `dto/`, `utils/`, and `constants/` — with `rag/` and `conversations.module.ts` retained at the module root. The oversized orchestrator `conversation-message.service.ts` was reduced from **457 → 269 lines** by extracting four naturally-bounded private responsibilities, without changing any observable behavior, public API, DTO, DB schema, idempotency, safety logic, prompts, thresholds, LLM behavior, or failure mappings. The 20-test characterization contract stayed green at every checkpoint. Unit tests were reorganized into matching subfolders.

No production behavior was changed. No AI / Safety / RAG architectural boundary issues were touched.

---

## 2. Scope & constraints honored

Performed:
- Moved 24 handwritten conversation source files into conventional folders.
- Refactored `conversation-message.service.ts` to ≤300 lines (269) via private-helper extraction.
- Updated `conversations.module.ts` import paths only.
- Reorganized `tests/unit/conversations/**` into `services/`, `utils/`, `dto/`, `repositories/` (no empty folders; AI-provider tests left at root).
- Updated all intra-module and test import specifiers.

Not performed (explicitly prohibited):
- Did not change observable behavior, APIs, DTOs, DB schema, idempotency, safety, prompts, thresholds, LLM behavior, or failure mappings.
- Did not fix AI, Safety, or RAG architectural boundary issues. Did not begin those refactors.
- Did not add features, streaming, retries, agents, or new architecture.
- Did not weaken any characterization assertion.

The 8-arg `ConversationMessageService` constructor `(access, conversations, messages, idempotency, router, safety, rag?, ai?)` — the test seam used by the 20 characterization tests — was preserved exactly; all extracted helpers are private and instantiated/invoked internally.

---

## 3. Pre-refactor baseline (inventory)

Before any change, the regression baseline was confirmed green:

| Suite | Config | Result |
|---|---|---|
| Characterization (`conversation-message-send.spec.ts`) | default | 1 file / 20 tests ✓ |
| Conversation unit | default | 17 files / 97 tests ✓ |
| Conversation contract | default | 3 files / 7 tests ✓ |
| Conversation e2e + integration | `vitest.config.e2e.ts` | 12 files / 26 tests ✓ |

Pre-refactor source tree (all flat under `src/modules/conversations/`, except `rag/`):

```
conversation.dto.ts(99)        conversation-presenter.ts(89)     conversation.errors.ts(56)
conversation.constants.ts(27) conversation-system.prompt.ts(19)
conversations.controller.ts(104)  conversations.module.ts(53)
conversation-message.service.ts(457)  conversation-lifecycle.service.ts(69)
conversation-access.service.ts(27)    conversation-idempotency.service.ts(23)
conversation-safety.service.ts(49)    conversation-router.service.ts(9)
conversation-context.service.ts(36)   conversation-follow-up-rewrite.service.ts(31)
conversation-grounding.service.ts(39)
conversation.repository.ts(100)       conversation-message.repository.ts(222)
conversation-follow-up-detector.ts(13) conversation-static-responses.ts(31)
conversation-citation-mapper.ts(34)    conversation-prompt-builder.ts(30)
conversation-failure-metadata.ts(25)  conversation-insufficient-evidence.ts(5)
rag/conversation-rag-client.port.ts(52)  rag/conversation-rag-client.service.ts(101)
```

File classification used for the move: controller / service / repository / DTO-schema / pure helper-utility / module-config / constants.

---

## 4. Post-refactor target structure

```
src/modules/conversations/
  conversations.module.ts                 (module config — root)
  controllers/  conversations.controller.ts
  services/     conversation-message.service.ts (269)
                conversation-lifecycle.service.ts
                conversation-access.service.ts
                conversation-idempotency.service.ts
                conversation-safety.service.ts
                conversation-router.service.ts
                conversation-context.service.ts
                conversation-follow-up-rewrite.service.ts
                conversation-grounding.service.ts
  repositories/ conversation.repository.ts
                conversation-message.repository.ts
  dto/          conversation.dto.ts
                conversation-presenter.ts
  utils/         conversation-follow-up-detector.ts
                conversation-static-responses.ts
                conversation-citation-mapper.ts
                conversation-prompt-builder.ts
                conversation-failure-metadata.ts
                conversation-insufficient-evidence.ts
  constants/    conversation.constants.ts
                conversation.errors.ts
                conversation-system.prompt.ts
  rag/          conversation-rag-client.port.ts
                conversation-rag-client.service.ts
```

Dependency direction is acyclic and conventional: `controllers → services → repositories + utils + dto`; `services → constants`; `utils → dto + constants + rag`; `rag` and `conversations.module.ts` stay at root. `conversations.module.ts` is the only root file besides the `rag/` subfolder.

Decision point resolved: `conversation.constants.ts`, `conversation.errors.ts`, and `conversation-system.prompt.ts` were placed in a dedicated `constants/` folder (the audit's recommendation) rather than left at root or dumped into `utils/` (they are constant/config data, not utility functions). This keeps the module root to a single file (`conversations.module.ts`).

---

## 5. File move map (old → new)

| Old path (root) | New path |
|---|---|
| `conversations.controller.ts` | `controllers/conversations.controller.ts` |
| `conversation-message.service.ts` | `services/conversation-message.service.ts` |
| `conversation-lifecycle.service.ts` | `services/…` |
| `conversation-access.service.ts` | `services/…` |
| `conversation-idempotency.service.ts` | `services/…` |
| `conversation-safety.service.ts` | `services/…` |
| `conversation-router.service.ts` | `services/…` |
| `conversation-context.service.ts` | `services/…` |
| `conversation-follow-up-rewrite.service.ts` | `services/…` |
| `conversation-grounding.service.ts` | `services/…` |
| `conversation.repository.ts` | `repositories/…` |
| `conversation-message.repository.ts` | `repositories/…` |
| `conversation.dto.ts` | `dto/…` |
| `conversation-presenter.ts` | `dto/…` |
| `conversation-follow-up-detector.ts` | `utils/…` |
| `conversation-static-responses.ts` | `utils/…` |
| `conversation-citation-mapper.ts` | `utils/…` |
| `conversation-prompt-builder.ts` | `utils/…` |
| `conversation-failure-metadata.ts` | `utils/…` |
| `conversation-insufficient-evidence.ts` | `utils/…` |
| `conversation.constants.ts` | `constants/…` |
| `conversation.errors.ts` | `constants/…` |
| `conversation-system.prompt.ts` | `constants/…` |
| `rag/conversation-rag-client.port.ts` | `rag/…` (unchanged location) |
| `rag/conversation-rag-client.service.ts` | `rag/…` (unchanged location) |

`git status` detects every move as a rename (`R`/`RM`); history is preserved. No file was renamed (only relocated); no public symbol changed.

Cross-module blast radius: only two src files outside the module reference it — `src/app.module.ts` (imports `conversations.module`, root — unaffected) and `src/modules/ai/conversation-ai.port.ts` (imports `conversations/rag/conversation-rag-client.port`, `rag/` stayed at root — unaffected). Neither required changes.

---

## 6. Import rewrite strategy

A throwaway, audited Node script (since deleted) rewrote relative import specifiers across all 18 moved source files using a basename→folder map and the file's new depth:
- Internal sibling references (`./conversation-<x>`) → `../<folder>/…` (or `./…` when same folder).
- `./rag/…` → `../rag/…` for files now one level deeper.
- External sibling-module refs (`../ai/`, `../safety/`, `../auth/`) and `../../common/`, `../../prisma/` gained one more `../` for files now one level deeper; root `conversations.module.ts` unchanged.
- `rag/` files only reference their sibling port → no change.

Test imports were rewritten separately: `…/src/modules/conversations/<basename>` → `…/src/modules/conversations/<folder>/<basename>` (25 test files), with `rag/…` subpaths left untouched.

Correctness was verified by the compiler: `tsc --noEmit -p tsconfig.build.json` reported 0 errors after the rewrite, and `nest build` succeeded. The throwaway scripts were removed so the refactor diff contains only production + test changes.

---

## 7. `conversation-message.service.ts` refactor: 457 → 269 lines

The orchestrator's `send()` pipeline order was preserved exactly:
`validation → access/ownership → idempotent replay → persist user message → safety → static/system routing → follow-up handling → retrieval → grounding → LLM generation → citation validation → assistant persistence → conversation activity update`.

Reduction was achieved by collapsing ~10 repeated `createAssistantMessage + touchAfterMessage + return`/`persistFailure + touchAfterMessage + return` blocks (each 8–12 lines) into two generic persistence helpers, plus extracting two naturally-bounded routing responsibilities out of the monolithic `send()`:

- `routeSafetyAndStatic(ctx, content)` — safety evaluation + static/system-command routing (both bypass RAG/LLM).
- `resolveStandaloneQuery(ctx, correlationId, recentHistory, content)` — follow-up detection + standalone-query resolution, returning either a redirect response (insufficient-context / rewrite failure) or the resolved retrieval query with its follow-up flag.

The inline unsafe-output regex (`/\b(diagnose|prescribe|stop medication|increase medication)\b/i`) was left in place inside `generateAnswerSafely` — untouched, per the "do not change safety/prompts" constraint.

---

## 8. Extracted private helpers & behavior preservation

| Helper | Responsibility | Behavior preserved |
|---|---|---|
| `persistAssistant(ctx, content, route, status, processingStage, failureCode, failureDetail, options)` | Persist a completed/failed assistant message, update conversation activity, return presented triple. | Forwards the exact positional args to `createAssistantMessage`. Crucially, it passes the `options` arg **only when non-empty**, so no-options branches still issue a 10-arg call (matching the original) while options branches issue an 11-arg call — downstream contracts assert on arg count. |
| `persistFailureAndReturn(ctx, processingStage, failureCode)` | Wrap `persistFailure` + activity update + return triple. | Reuses the pre-existing `persistFailure` (`createAssistantFailure`) unchanged. |
| `routeSafetyAndStatic` | Safety + static/system routing early-return. | Same evaluation order, same branch outcomes, same persistence args. |
| `resolveStandaloneQuery` | Follow-up detection + rewrite resolution. | `followUpDetector.isFollowUp` still called exactly once per send; empty-history short-circuit and the two redirect outcomes preserved. |

A `SendContext` (`{ userId, conversationId, userMessage, userMessageId }`) is built once after the user message is persisted and threaded through the helpers; the idempotent-replay path returns before that (using `stored.*`, unchanged).

Types were kept faithful: `AssistantRoute`, `AssistantStatus`, and `AssistantOptions` are derived via `Parameters<ConversationMessageRepository['createAssistantMessage']>[…]` so they cannot drift from the repository's real signature. `SendResponse` is a concrete object type (avoiding a self-referential alias).

Counterintuitive behaviors explicitly preserved (from the characterization baseline):
1. Idempotent replay skips `touchAfterMessage` and all downstream work.
2. Unconfigured-port branch persists via `createAssistantMessage` (FAILED, stage `RAG`) with `RAG_UNAVAILABLE`/`LLM_UNAVAILABLE` — not via `createAssistantFailure`.
3. RAG-search-failure, LLM-failure, and citation-failure branches persist via `createAssistantFailure` (`persistFailure`) with stage-specific `safeFailureDetail`.
4. The unconfigured-port branch reports processing stage `RAG` for both missing clients.
5. Follow-up insufficient-context short-circuits before any AI/RAG/LLM call.
6. The inline unsafe-output gate rejects content post-LLM as `LLM_UNSAFE_OUTPUT`.
7. All non-replay paths `touchAfterMessage` exactly once.

---

## 9. `conversations.module.ts` changes

Only import specifiers changed (paths to the relocated providers/controllers). The `@Module` declaration, `imports`, `controllers`, `providers` list, port bindings (`CONVERSATION_RAG_CLIENT_PORT`/`CONVERSATION_AI_PORT` `useExisting`), and `exports` are byte-identical. No provider was added, removed, or reordered.

---

## 10. Test reorganization (unit subfolders)

`tests/unit/conversations/**` reorganized (contract and e2e suites stay in place — only their import paths were updated in Phase 2b):

- `services/` (7): `conversation-message-send`, `conversation-access`, `conversation-idempotency`, `conversation-router-static`, `conversation-retrieval-outcomes`, `conversation-context-window`, `conversation-safety-routing`.
- `utils/` (4): `conversation-follow-up-detector`, `conversation-failure-metadata`, `conversation-citation-mapper`, `conversation-prompt-builder`.
- `dto/` (1): `conversation-dto`.
- `repositories/` (1): `conversation-schema` (tests the Prisma data model — the data-layer home; also keeps `repositories/` non-empty).
- Left at root (AI-provider tests, **not** moved per instructions): `conversation-ai-ports`, `conversation-llm-adapter`, `conversation-ollama-cloud-provider`, `conversation-llm-failures` (the last imports `normalizeConversationLlmError` from the AI module — its primary subject is the AI adapter).

Moved files had their relative depth bumped from `../../../` to `../../../../`. `vitest.config` includes `tests/unit/**`, so subfolders are picked up automatically. No empty folders were created.

---

## 11. Behavior-preservation evidence

The 20-test characterization contract (`conversation-message-send.spec.ts`) — which locks idempotent replay, the full RAG→grounding→LLM→citation success path, safety hold/technical-failure, static/system routing, follow-up rewrite success/insufficient/failed, RAG unconfigured + search-failure (unavailable/timeout/invalid), insufficient evidence, LLM failure (throw/invalid/unsafe/unconfigured), citation failure, success metadata, and the Safety-before-RAG / RAG-before-LLM / validation-before-success ordering — passed at every checkpoint:

- After source moves + import rewrite: 20/20 ✓
- After the service refactor (first cut): 20/20 ✓
- After the arg-count fix + type fix: 20/20 ✓
- After test reorganization: 20/20 ✓

No assertion in the characterization file was modified or weakened.

---

## 12. Validation matrix (final)

| Check | Command / config | Result |
|---|---|---|
| Characterization (20) | `vitest run tests/unit/conversations/services/conversation-message-send.spec.ts` | 1 file / 20 tests ✓ |
| Conversation unit | `vitest run tests/unit/conversations` | 17 files / 97 tests ✓ |
| Conversation contract | `vitest run tests/contract/conversations` (default config) | 3 files / 7 tests ✓ |
| Conversation e2e + integration | `vitest run --config vitest.config.e2e.ts tests/e2e/conversations tests/integration` | 12 files / 26 tests ✓ |
| Build | `nest build` | exit 0 ✓ |
| Typecheck | `tsc --noEmit -p tsconfig.build.json` | 0 errors ✓ |
| ESLint (Conversation scope) | `eslint src/modules/conversations tests/{unit,contract,e2e}/conversations tests/integration` | exit 0 ✓ |
| `git diff --check` | — | exit 0 ✓ (CRLF notices only, no whitespace/conflict errors) |
| Service line count | `wc -l …/conversation-message.service.ts` | 269 (≤300) ✓ |

Full project unit+contract run (`vitest run`): 43/44 files, 335/338 tests pass — the single failing file is `tests/unit/coaching-grounding.spec.ts` (Coaching module), see §13.

---

## 13. Pre-existing issues NOT introduced by this refactor

These were present before this work, are outside the Conversation Module, and were intentionally left untouched per the constraints:

1. **ESLint `no-useless-catch`** in `src/modules/ai/ollama-conversation-llm.provider.ts:71` — a file in the AI module that was already modified (staged) at the start of this session and was never opened or edited during the refactor. The Conversation Module scope lints clean (exit 0). Fixing it would mean editing the AI module, which is explicitly out of scope.
2. **`tests/unit/coaching-grounding.spec.ts`** (3 failing tests) — imports only from `src/modules/coaching/**`, has zero references to `conversations`, and neither it nor the coaching source was modified by this refactor (`git status` clean for those paths). The failures concern coaching library/disclaimer snapshot lookups (environmental/fixture-related), unrelated to this structural refactor.

Neither is a regression from this work; both are documented here for transparency.

---

## 14. Refactor risks & mitigations

| Risk | Mitigation |
|---|---|
| Import path breakage across many files | Used a map-driven rewrite, then the TypeScript compiler as the oracle (`tsc --noEmit` 0 errors) and `nest build` to confirm before running tests. |
| Arg-count drift breaking e2e contracts | `persistAssistant` conditionally omits the `options` arg when empty, preserving the original 10-arg vs 11-arg call shapes; the 3 e2e suites that assert exact arg counts were re-run and pass. |
| Type drift on `route`/`status`/`options` | Derived helper param types from `Parameters<ConversationMessageRepository['createAssistantMessage']>[…]` so they track the repository signature. |
| Constructor signature change breaking the test seam | All extracted units are private; the public 8-arg constructor is unchanged. |
| Behavior regression during extraction | Ran the 20-test characterization contract after every step; it never went red at a checkpoint. |
| Cross-module breakage | Pre-move grep confirmed only `app.module.ts` and `ai/conversation-ai.port.ts` reference the module, both into root-resident files — unaffected. Full project suite re-run confirms no cross-module regression. |
| Stray tooling artifacts | The two one-shot migration scripts were deleted; the final diff contains only production + test changes. |

---

## 15. Conclusion & next steps

The Conversation Module structural refactor is complete and validated. The module now follows the conventional NestJS layout (controllers / services / repositories / dto / utils / constants, with `rag/` and the module file at root), and the orchestrator is 269 lines — under the ≤300 target — with all characterized behavior preserved byte-for-byte and the full conversation regression suite green (unit 17/97, contract 3/7, e2e+integration 12/26, characterization 20/20, build + typecheck + lint clean).

Per the task instructions, work stops here. The AI, Safety, and RAG architectural boundary refactors (per the audit) have **not** been started and remain as separate, explicitly-scoped future work. The two pre-existing issues documented in §13 are out of scope for this refactor and were intentionally left untouched.