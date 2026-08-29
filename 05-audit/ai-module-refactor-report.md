# AI Module Structural Refactor — Final Report

Spec: AI Module structural refactor (behavior-preserving). Branch `006-home-dashboard`.
Date: 2026-08-09. Follows the Conversation Module refactor (`conversation-module-refactor-report.md`) and the backend-module audit (`backend-modules-audit.md`).

---

## 1. Summary

The AI Module (`src/modules/ai/**`) was restructured into conventional NestJS folders — `ports/`, `services/`, `providers/`, `dto/`, `utils/` — with `ai.module.ts` and the single `prompt-templates.ts` retained at the module root. One genuine responsibility split was performed (`coaching-llm.adapter.ts` → adapter + `dto/coaching-plan.schema.ts`); the dead `ai.config.ts` (zero importers) was removed; the one-file `prompt-templates/` folder was flattened. No observable behavior, public API, DTO contract, provider configuration, structured-output handling, prompt, error semantics, retry count, or LLM call count was changed. All AI-owned tests stayed green and the Conversation + Coaching regression suites that exercise AI stayed green at every checkpoint.

No production behavior was changed. No cross-module boundary issue was fixed.

---

## 2. Scope & constraints honored

Performed:
- Moved 13 AI source files into conventional folders via `git mv` (history preserved).
- Split `coaching-llm.adapter.ts` (107 → 74 lines) by extracting the coaching-plan JSON schema + its `isPlanOutput` validator into `dto/coaching-plan.schema.ts` (34 lines).
- Removed dead `ai.config.ts` (verified zero importers in `src` and `tests`).
- Flattened the one-file `prompt-templates/` folder to a root `prompt-templates.ts`.
- Updated `ai.module.ts` import path only (`./coaching-llm.adapter` → `./services/coaching-llm.adapter`).
- Reorganized AI-owned tests: moved 4 files into `tests/unit/ai/` (flat — no one-file subfolders).
- Rewrote all AI-internal, cross-module (conversations, coaching), and test import specifiers via an audited throwaway script (since deleted); the TypeScript compiler was the oracle.

Not performed (explicitly prohibited):
- Did not change observable behavior, APIs, DTOs, DB schema, prompts, schema contracts, model/provider configuration, error semantics, retries, LLM call counts, streaming, or agents.
- Did not fix any AI/Conversation/Coaching/Safety/RAG boundary issue. Did not begin Coaching structural refactoring or Boundary Hardening.
- Did not split any file merely for size (largest is `conversation-llm.adapter.ts` at 198 lines, under the 300-line bar, owning one coherent responsibility).
- Did not add fallback parsing, a second LLM call, or silent repair to structured-output handling.
- Did not weaken or delete any test. Did not move the ambiguous-ownership `conversation-llm-failures.spec.ts`.

---

## 3. Pre-refactor baseline (inventory)

Before any change, the regression baseline was confirmed green:

| Suite | Config | Result |
|---|---|---|
| AI-owned unit (5 files) | default | 5 / 48 ✓ |
| Conversation unit + contract (20 files) | default | 20 / 104 ✓ |
| Conversation e2e + integration (12 files) | `vitest.config.e2e.ts` | 12 / 26 ✓ |
| Coaching unit — coaching-llm.adapter + coaching-generation (2 files) | default | 2 / 13 ✓ |
| Coaching contract (2 files) | default | 2 / 23 ✓ |
| Coaching e2e — coaching-plan (1 file) | `vitest.config.e2e.ts` | 1 / 9 ✓ |

Pre-refactor AI source tree (all flat under `src/modules/ai/`, except `prompt-templates/`):

```
ai.module.ts (9)                     ai.config.ts (15) — DEAD, zero importers
coaching-llm.adapter.ts (107)        conversation-ai.port.ts (43)
conversation-llm.adapter.ts (198)     conversation-llm.errors.ts (86)
conversation-llm-provider.ts (12)     conversation-llm-response.ts (90)
conversation-json-schema-validator.ts (57)
ollama-conversation-llm.provider.ts (149)   openai-conversation-llm.provider.ts (64)
fake-coaching-llm.adapter.ts (26)    fake-conversation-ai.adapter.ts (47)
prompt-templates/prompt-templates.ts (10)
```

File classification: module-config / service-adapter / port / provider / pure-helper-utility / dto-schema / constants(prompt).

---

## 4. Post-refactor target structure

```
src/modules/ai/
  ai.module.ts                                       (module config — root)
  prompt-templates.ts                                (constants — root, flattened from prompt-templates/)
  ports/     conversation-ai.port.ts                 (public Conversation AI port + its contract DTOs)
            conversation-llm-provider.ts             (internal provider-client contract + request)
  services/  coaching-llm.adapter.ts (74)           (CoachingLlmAdapter orchestration)
            conversation-llm.adapter.ts (198)        (ConversationLlmAdapter orchestration + error re-export)
            fake-coaching-llm.adapter.ts              (test double)
            fake-conversation-ai.adapter.ts           (test double)
  providers/ ollama-conversation-llm.provider.ts     (Ollama local + cloud provider)
            openai-conversation-llm.provider.ts       (OpenAI provider)
  dto/       coaching-plan.schema.ts (34)            (NEW — coaching-plan JSON schema + isPlanOutput validator)
  utils/     conversation-llm.errors.ts               (error classes + normalization)
            conversation-llm-response.ts              (provider response parser)
            conversation-json-schema-validator.ts     (hand-rolled JSON-schema subset validator)
```

Dependency direction is acyclic and conventional: `ai.module → services`; `services → ports + providers + utils + dto`; `providers → ports + utils`; `ports → utils`; `dto → (external coaching port type only)`; `utils → ∅`. No reverse dependencies (utils→services, ports→providers, providers→services) exist. `ai.module.ts` is the only root file besides the single `prompt-templates.ts` constant.

Decision points resolved:
- `dto/` holds a genuine schema definition + its runtime validator (one cohesive file) — not created for symmetry.
- `conversation-llm.errors.ts`, `conversation-llm-response.ts`, `conversation-json-schema-validator.ts` → `utils/` (pure helpers / error types), not `constants/` (this module has no `constants/` folder — the single prompt template lives at root as `prompt-templates.ts`).
- `conversation-llm-provider.ts` → `ports/` (it defines the internal `ConversationLlmProviderClient` interface providers implement — an internal contract).
- The 4 moved AI tests live flat in `tests/unit/ai/` (no `services/providers/ports/utils` subfolders — avoids three one-file test folders).

---

## 5. File move map (source)

| Old path | New path | Type |
|---|---|---|
| `conversation-ai.port.ts` | `ports/conversation-ai.port.ts` | port |
| `conversation-llm-provider.ts` | `ports/conversation-llm-provider.ts` | internal port |
| `coaching-llm.adapter.ts` | `services/coaching-llm.adapter.ts` | service (split) |
| `conversation-llm.adapter.ts` | `services/conversation-llm.adapter.ts` | service |
| `fake-coaching-llm.adapter.ts` | `services/fake-coaching-llm.adapter.ts` | test double |
| `fake-conversation-ai.adapter.ts` | `services/fake-conversation-ai.adapter.ts` | test double |
| `ollama-conversation-llm.provider.ts` | `providers/ollama-conversation-llm.provider.ts` | provider |
| `openai-conversation-llm.provider.ts` | `providers/openai-conversation-llm.provider.ts` | provider |
| `conversation-llm.errors.ts` | `utils/conversation-llm.errors.ts` | util (errors) |
| `conversation-llm-response.ts` | `utils/conversation-llm-response.ts` | util (parser) |
| `conversation-json-schema-validator.ts` | `utils/conversation-json-schema-validator.ts` | util (validator) |
| `prompt-templates/prompt-templates.ts` | `prompt-templates.ts` | constants (flattened) |
| `ai.config.ts` | *(deleted — dead code, 0 importers)* | — |
| *(new)* | `dto/coaching-plan.schema.ts` | dto (extracted from coaching-llm.adapter.ts) |

`git status` detects every relocation as a rename (`R`/`RM`); history is preserved. No public symbol changed name. The one deletion (`ai.config.ts`) is confirmed dead (grep across `src` + `tests` returned zero importers).

Cross-module blast radius (mechanical import-path updates only — because AI files moved):
- `conversations/conversations.module.ts`, `conversations/services/{conversation-context,conversation-follow-up-rewrite,conversation-message}.service.ts`, `conversations/utils/{conversation-citation-mapper,conversation-prompt-builder}.ts` — `…/ai/conversation-ai.port` → `…/ai/ports/conversation-ai.port`; `…/ai/conversation-llm.adapter` → `…/ai/services/conversation-llm.adapter`.
- `coaching/coaching-generation.service.ts` — `…/ai/conversation-llm.errors` → `…/ai/utils/conversation-llm.errors`.
- `coaching/coaching-grounding.service.ts` — `…/ai/prompt-templates/prompt-templates` → `…/ai/prompt-templates`.
- `coaching/coaching.module.ts` — `…/ai/ai.module` (unchanged; root file stayed).
- `src/app.module.ts` — imports `AiModule` from the root `ai.module.ts` (unchanged).

---

## 6. File move map (tests)

| Old path | New path | Owner | Action |
|---|---|---|---|
| `tests/unit/coaching-llm.adapter.spec.ts` | `tests/unit/ai/coaching-llm.adapter.spec.ts` | AI | moved |
| `tests/unit/conversations/conversation-ai-ports.spec.ts` | `tests/unit/ai/conversation-ai-ports.spec.ts` | AI | moved |
| `tests/unit/conversations/conversation-llm-adapter.spec.ts` | `tests/unit/ai/conversation-llm-adapter.spec.ts` | AI | moved |
| `tests/unit/conversations/conversation-ollama-cloud-provider.spec.ts` | `tests/unit/ai/conversation-ollama-cloud-provider.spec.ts` | AI | moved |
| `tests/unit/conversations/conversation-llm-failures.spec.ts` | *(unchanged location)* | **MIXED** | left in place; AI import path updated only |

The first four directly test AI-owned units (`CoachingLlmAdapter`, `isPlanOutput`, `matchesConversationSchema`, `FakeConversationAiAdapter`, `ConversationLlmAdapter`, `OllamaConversationLlmProvider`, `ConversationLlmProviderRequest`) — clearly AI ownership, purely structural moves.

`conversation-llm-failures.spec.ts` is **mixed ownership**: one test block asserts `normalizeConversationLlmError` (AI-owned) and a second asserts `ConversationCitationMapper` (conversations-owned). Per the task rule ("if ownership is ambiguous, leave it where it is and report the ambiguity rather than making an architectural decision during a structural refactor"), it was left in `tests/unit/conversations/` and only its AI import path was updated (`…/ai/conversation-llm.adapter` → `…/ai/services/conversation-llm.adapter`). Splitting it into an AI test + a conversations test is a defensible future step but is an architectural decision beyond this structural refactor.

In-place tests whose AI import paths were updated (no relocation):
- `tests/unit/conversations/services/conversation-message-send.spec.ts` (characterization, 20 tests) — 3 AI paths.
- `tests/e2e/conversations/conversation-failure-retry.e2e-spec.ts`, `conversation-follow-up.e2e-spec.ts`, `conversation-insufficient-retrieval.e2e-spec.ts`, `conversation-rag-answer.e2e-spec.ts`, `conversation-redaction-audit.e2e-spec.ts` — `FakeConversationAiAdapter` and `ConversationLlmError` paths.
- `tests/e2e/coaching-plan.spec.ts`, `tests/unit/coaching-generation.spec.ts` — `FakeCoachingLlmAdapter` path.
- `tests/helpers/fake-conversation-llm.ts` — re-export path.

Moved test files kept the same relative depth to `src/` (`../../../src`) except `coaching-llm.adapter.spec.ts`, which gained one level (`../../src` → `../../../src`) because it moved from `tests/unit/` to `tests/unit/ai/`. `vitest` includes `tests/unit/**` recursively, so the new `tests/unit/ai/` folder is picked up automatically.

---

## 7. The single split: `coaching-llm.adapter.ts` → `services/` + `dto/`

`coaching-llm.adapter.ts` (107 lines) genuinely owned two coherent, separable responsibilities:
1. `CoachingLlmAdapter` — LLM provider orchestration (config → client selection → `complete()` → error normalization → result shaping).
2. The coaching-plan structured-output definition + its runtime validator — `COACHING_PLAN_SCHEMA` (JSON schema), `bilingualValue` (private helper), `isPlanOutput` (type guard).

These were split:
- `services/coaching-llm.adapter.ts` (74 lines) keeps the adapter; it now imports `COACHING_PLAN_SCHEMA, isPlanOutput` from `../dto/coaching-plan.schema` and drops the no-longer-needed `LlmPlanOutput` type import.
- `dto/coaching-plan.schema.ts` (34 lines) holds `COACHING_PLAN_SCHEMA` (export const), `isPlanOutput` (export function), and the private `bilingualValue` helper, importing only the `LlmPlanOutput` type from the coaching port.

The extracted block is a byte-for-byte copy — no schema field, `additionalProperties: false`, `minItems`/`maxItems`, `minLength`, nested-validation predicate, or `version === '1.0'` check changed. `isPlanOutput` was already tested in isolation in `coaching-llm.adapter.spec.ts`, so the split is covered. This is the only split of the phase; no file was split merely for size (`conversation-llm.adapter.ts` at 198 lines was left intact — its inline JSON schemas are used once each and not exported, so extracting them would be unnecessary abstraction).

---

## 8. Final responsibility of each AI folder

| Folder / root file | Responsibility | Contents |
|---|---|---|
| `ai.module.ts` | NestJS module wiring (providers + `COACHING_LLM_PORT` binding + export). Imports only `COACHING_LLM_PORT` (coaching port) and `CoachingLlmAdapter` (services). | 1 file |
| `prompt-templates.ts` | Constant prompt template string(s) consumed by coaching grounding. | 1 file |
| `ports/` | AI contracts: the public `ConversationAiPort` (+ its request/result DTOs, `ConversationHistoryItem`) and the internal `ConversationLlmProviderClient` interface + `ConversationLlmProviderRequest`. | 2 files |
| `services/` | Injectable adapters that implement ports by orchestrating providers: `CoachingLlmAdapter`, `ConversationLlmAdapter` (re-exports error symbols for cross-module consumers), plus two test doubles. | 4 files |
| `providers/` | Concrete LLM provider clients (`complete()`): Ollama (local + cloud) and OpenAI. Own per-request AbortController + timeout, `format`/`think:false`/`cloudInstructions`, fenced-JSON handling, provider error mapping. | 2 files |
| `dto/` | AI structured-output schema definitions + their validators: `coaching-plan.schema.ts`. | 1 file |
| `utils/` | Pure helpers / error types: `conversation-llm.errors.ts` (error class + `categorizeNetworkError` + `normalizeConversationLlmError`), `conversation-llm-response.ts` (response parser: `parseProviderResponse`, `unwrapJsonFence`, `readUsage`), `conversation-json-schema-validator.ts` (`matchesConversationSchema`). | 3 files |

No folder was created empty. No folder holds a single file that could have been flattened without harming clarity (`dto/` and `ports/` each genuinely group their concern; `prompt-templates.ts` was flattened because its folder held only one trivial file).

---

## 9. AI test results

| Suite | Config | Before | After | Result |
|---|---|---|---|---|
| `tests/unit/ai/` (4 moved files) | default | — | 4 / 46 | ✓ |
| `tests/unit/conversations/conversation-llm-failures.spec.ts` (in place) | default | 1 / 2 | 1 / 2 | ✓ |
| **AI-owned total** | default | **5 / 48** | **5 / 48** | **✓ no change** |

All AI-owned unit/provider tests pass with identical counts. The 3 moved conversation-AI specs (40 tests) now run under `tests/unit/ai/` and are counted there; `conversation-llm-failures.spec.ts` (2 tests) stayed in place.

---

## 10. Conversation regression results

| Suite | Config | Before | After | Result |
|---|---|---|---|---|
| Conversation unit + contract | default | 20 / 104 | 17 / 64 | ✓ |
| Conversation e2e + integration | `vitest.config.e2e.ts` | 12 / 26 | 12 / 26 | ✓ |
| Characterization (`conversation-message-send.spec.ts`) | default | 1 / 20 | 1 / 20 | ✓ |

The unit+contract count dropped from 104 to 64 **because the 3 AI-owned specs (40 tests) were relocated to `tests/unit/ai/`**, not because any test was lost — those 40 tests now run under the AI-owned suite (see §9). The 20-test characterization contract, the full e2e + integration suite (including the arg-count-asserting `conversation-failure-retry` and `conversation-redaction-audit` specs), and the contract suite all stayed green with unchanged counts. No conversation behavior changed.

---

## 11. Coaching regression results

| Suite | Config | Before | After | Result |
|---|---|---|---|---|
| `coaching-llm.adapter.spec.ts` (moved to `tests/unit/ai/`) | default | (part of 13) | (part of 46) | ✓ |
| `coaching-generation.spec.ts` | default | 1 / 7 | 1 / 7 | ✓ |
| Coaching contract | default | 2 / 23 | 2 / 23 | ✓ |
| Coaching e2e — `coaching-plan.spec.ts` | `vitest.config.e2e.ts` | 1 / 9 | 1 / 9 | ✓ |

The `coaching-llm.adapter.spec.ts` test (6 tests) moved with the adapter and passes from its new location; `isPlanOutput` now imports from `dto/coaching-plan.schema`. Coaching generation, contract, and e2e unchanged. No coaching behavior changed.

---

## 12. Build / typecheck result

| Check | Command | Result |
|---|---|---|
| Typecheck | `tsc --noEmit -p tsconfig.build.json` | 0 errors ✓ |
| Build | `nest build` | exit 0 ✓ |

The TypeScript compiler was the import-fixing oracle: after the map-driven rewrite, `tsc --noEmit` reported 0 errors on the first run, confirming every AI-internal, cross-module, and test import resolves.

---

## 13. Lint results

| Scope | Command | Result |
|---|---|---|
| AI scope | `eslint src/modules/ai tests/unit/ai` | 1 error (pre-existing, see below) |
| Project-wide | `eslint src tests` | 1 error (same pre-existing) |

The single error is **pre-existing and not introduced by this refactor**:
- `src/modules/ai/providers/ollama-conversation-llm.provider.ts:71:7` — `no-useless-catch` ("Unnecessary try/catch wrapper").

This error existed before this work (the file was already staged-modified at session start, line 71 unchanged by me — I only rewrote import specifiers in that file). Per the task constraints ("do not fix cross-module ownership yet" / behavior-preserving), it was intentionally left untouched. The refactor introduced **zero** new lint errors project-wide.

---

## 14. `git diff --check` result

`git diff --check` → exit 0. Only `LF will be replaced by CRLF` line-ending normalization notices (identical to the prior Conversation refactor); no whitespace errors, no conflict markers, no trailing-whitespace issues.

---

## 15. Remaining AI responsibility mixing (intentional, within AI)

- `services/conversation-llm.adapter.ts` re-exports error symbols (`ConversationLlmError`, `normalizeConversationLlmError`, `type ConversationLlmFailureCode`) from `utils/conversation-llm.errors`. This re-export is a **cross-module consumption seam** (coaching + conversations import these symbols from the adapter path). It was preserved exactly (only the re-export target path changed to `../utils/conversation-llm.errors`). Removing the re-export would be an API change and is out of scope.
- `services/conversation-llm.adapter.ts` keeps the grounded-answer and follow-up-rewrite JSON schemas inline as literals passed to `completeJson`. They are used once each and not exported; extracting them to `dto/` would be unnecessary abstraction (Phase 6). Left inline by design.
- `ports/conversation-ai.port.ts` co-locates the port with its request/result DTOs (`ConversationHistoryItem`, `GroundedAnswerRequest/Result`, `FollowUpRewriteRequest/Result`) — the audit classified this as GOOD (port + its contract DTOs together). Not split.
- `tests/unit/conversations/conversation-llm-failures.spec.ts` mixes an AI error-normalization test with a conversations citation-mapper test (see §6). Left in place; ambiguity reported.

No AI file exceeds 198 lines; no file owns >1 coherent responsibility except the one split performed.

---

## 16. Cross-module boundary issues intentionally deferred

Per Phase 4, these were documented and left untouched (only their import paths were updated mechanically because AI files moved):

1. **ai → conversations reverse type-dependency (audit V6):** `ports/conversation-ai.port.ts` imports `ConversationRagChunk` from `conversations/rag/conversation-rag-client.port`. Preserved; path deepened to `../../conversations/rag/conversation-rag-client.port`.
2. **ai → coaching reverse source-dependency (audit V10):** `dto/coaching-plan.schema.ts` (and `services/coaching-llm.adapter.ts`, `services/fake-coaching-llm.adapter.ts`) import types from `coaching/ports/coaching-llm.port`. Preserved; paths updated.
3. **coaching consumes AI internals (audit V4):** `coaching/coaching-generation.service.ts` imports `normalizeConversationLlmError` from `ai/utils/conversation-llm.errors`; `coaching/coaching-grounding.service.ts` imports `COACHING_PLAN_PROMPT_TEMPLATE` from `ai/prompt-templates`. Preserved; paths updated.
4. **AiModule does not export `CONVERSATION_AI_PORT` (audit V5):** `AiModule` exports only `COACHING_LLM_PORT`; conversations re-wires `ConversationLlmAdapter` + `CONVERSATION_AI_PORT` directly in `conversations.module.ts`. Preserved exactly — `ai.module.ts` content unchanged except the one import path; `conversations.module.ts` only had its two AI import paths updated.
5. **CoachingLlmAdapter error-normalization coupling (audit V4):** the coaching adapter reuses conversation-oriented `ConversationLlmError`/`normalizeConversationLlmError`. Preserved; import path updated.

None of these were fixed. They remain explicitly-scoped future work (Boundary Hardening).

---

## 17. Confirmation: provider & structured-output behavior did not change

Provider behavior (Phase 5) — all preserved byte-for-byte; only file locations and import specifiers changed:
- Ollama provider: per-request `AbortController` + timeout; `format: cloudModel ? 'json' : request.schema`; `think: false`; `cloudInstructions`; `isProviderErrorBody`; `chatUrl`/`headers`; `categorizeNetworkError`/`normalizeConversationLlmError` mapping. The number of provider HTTP requests per call is unchanged.
- OpenAI provider: per-request `AbortController` + timeout; response parsing; error mapping. Unchanged.
- Model selection, timeout config reads, and the disabled/unconfigured-provider branch (`createClient` returning `null` → `LLM_DISABLED`) are unchanged.

Structured-output behavior (Phase 6) — all preserved:
- Strict local-Ollama schema mode (`format: request.schema`) and Ollama Cloud `format: 'json'` with `cloudInstructions` — unchanged.
- Schema instructions, required fields, `minLength`, `minItems`/`maxItems`, nested object validation, `additionalProperties: false` on every object — unchanged (the `COACHING_PLAN_SCHEMA` was moved verbatim to `dto/coaching-plan.schema.ts`).
- Markdown JSON-fence handling (`unwrapJsonFence`), rejection of surrounding prose, and the hand-rolled `matchesConversationSchema` validator (cloud path) — unchanged (moved verbatim to `utils/`).
- Invalid-output normalization (`LLM_INVALID_OUTPUT`) — unchanged. No fallback parsing, no second LLM call, no silent repair was added.

Evidence: the AI-owned suite (`conversation-ollama-cloud-provider.spec.ts`, `conversation-llm-adapter.spec.ts`, `coaching-llm.adapter.spec.ts`) — which locks cloud fenced-JSON handling, schema-mode selection, `think:false`, provider error mapping, `isPlanOutput` acceptance/rejection, and `matchesConversationSchema` — passes with identical counts (§9), and the Conversation + Coaching regression suites that exercise the live provider paths pass with identical counts (§10, §11).

---

## 18. Validation matrix (final)

| Check | Command / config | Result |
|---|---|---|
| AI-owned unit | `vitest run tests/unit/ai tests/unit/conversations/conversation-llm-failures.spec.ts` | 5 / 48 ✓ |
| Conversation unit + contract | `vitest run tests/unit/conversations tests/contract/conversations` | 17 / 64 ✓ (40 tests relocated to `tests/unit/ai`) |
| Conversation e2e + integration | `vitest run --config vitest.config.e2e.ts tests/e2e/conversations tests/integration` | 12 / 26 ✓ |
| Coaching unit | `vitest run tests/unit/coaching-generation.spec.ts` (+ `coaching-llm.adapter.spec.ts` via `tests/unit/ai`) | 7 + 6 ✓ |
| Coaching contract | `vitest run tests/contract/coaching` | 2 / 23 ✓ |
| Coaching e2e | `vitest run --config vitest.config.e2e.ts tests/e2e/coaching-plan.spec.ts` | 1 / 9 ✓ |
| Project-wide unit+contract | `vitest run` | 43 / 44 files, 335 / 338 tests — 1 pre-existing failure (`coaching-grounding.spec.ts`, 3 tests, no AI imports, untouched by this refactor) |
| Typecheck | `tsc --noEmit -p tsconfig.build.json` | 0 errors ✓ |
| Build | `nest build` | exit 0 ✓ |
| ESLint AI scope | `eslint src/modules/ai tests/unit/ai` | 1 pre-existing error (ollama `no-useless-catch:71`) ✓ |
| ESLint project-wide | `eslint src tests` | 1 pre-existing error (same) ✓ |
| `git diff --check` | — | exit 0 (CRLF notices only) ✓ |
| Largest AI file | `wc -l …/services/conversation-llm.adapter.ts` | 198 (≤300) ✓ |

---

## 19. Conclusion & next steps

The AI Module structural refactor is complete and validated. The module now follows the conventional NestJS layout (`ports / services / providers / dto / utils`, with `ai.module.ts` and `prompt-templates.ts` at root), the one genuine responsibility split was performed (`coaching-llm.adapter.ts` → adapter + `dto/coaching-plan.schema.ts`), dead code (`ai.config.ts`) was removed, and the one-file `prompt-templates/` folder was flattened — with all characterized AI/provider/structured-output behavior preserved and the full AI + Conversation + Coaching regression suites green (AI 5/48, Conversation unit+contract 17/64 + e2e 12/26, Coaching 7+6 / contract 23 / e2e 9, build + typecheck clean, lint with only the 1 pre-existing error, `git diff --check` clean).

Per the task instructions, work stops here. The Coaching structural refactor and Boundary Hardening (the 5 deferred cross-module boundary issues in §16) have **not** been started and remain as separate, explicitly-scoped future work. The pre-existing `no-useless-catch` lint error and the pre-existing `coaching-grounding.spec.ts` failures are out of scope and were intentionally left untouched.