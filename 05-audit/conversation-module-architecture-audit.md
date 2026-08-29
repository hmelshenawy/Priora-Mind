# Conversation Module — Architecture Audit (Read-Only)

> No code was modified, moved, or renamed. This is a behavior-preservation baseline for a future refactor.

## 1. Current Conversation Module Tree

```text
02-BACKEND/src/modules/conversations/
├── conversations.module.ts            (53)   module/config — wiring
├── conversations.controller.ts        (104)  controller
├── conversation-message.service.ts    (457)  ★ service — orchestration (OVER 300)
├── conversation-lifecycle.service.ts  (69)   service — CRUD lifecycle
├── conversation-safety.service.ts      (49)   service — free-text safety classification (LEAK)
├── conversation-access.service.ts      (27)   service — eligibility gate
├── conversation-idempotency.service.ts (23)   service — idempotency lookup
├── conversation-context.service.ts     (36)   service — recent-history loading
├── conversation-follow-up-rewrite.service.ts (31) service — AI follow-up rewrite
├── conversation-grounding.service.ts   (39)   service — chunk selection
├── conversation-prompt-builder.ts      (30)   service — prompt assembly
├── conversation-citation-mapper.ts     (34)   service — citation mapping
├── conversation-router.service.ts      (9)    service — 1-call wrapper around a pure fn
├── conversation-follow-up-detector.ts  (13)   helper (pure fn, @Injectable)
├── conversation-static-responses.ts    (31)   helper (pure fn)
├── conversation-failure-metadata.ts    (25)   helper (pure fns)
├── conversation-insufficient-evidence.ts (5)  helper (trivial wrapper)
├── conversation-system.prompt.ts       (19)   constants — system instructions
├── conversation-presenter.ts           (89)   presenter/mapping
├── conversation.dto.ts                  (99)   dto + zod schemas
├── conversation.errors.ts              (56)   errors
├── conversation.constants.ts           (27)   constants
├── conversation.repository.ts           (100)  repository
├── conversation-message.repository.ts  (222)  repository
└── rag/
    ├── conversation-rag-client.port.ts      (52)  port (Conversations-owned)
    └── conversation-rag-client.service.ts  (101) service — RAG HTTP client (LEAK)
```

Total: **27 source files, 1800 lines.** Only `conversation-message.service.ts` exceeds 300 lines.

## 2. Source File Line-Count Table

| File | Lines | Role | Injectable? | >300? |
|---|---:|---|---|---|
| conversation-message.service.ts | 457 | orchestration | service | **★ YES** |
| conversation-message.repository.ts | 222 | persistence | repository | |
| conversations.controller.ts | 104 | HTTP controller | controller | |
| conversation.dto.ts | 99 | DTO + zod | dto | |
| conversation-presenter.ts | 89 | row→DTO mapping | helper | |
| conversation-lifecycle.service.ts | 69 | CRUD lifecycle | service | |
| conversation.errors.ts | 56 | typed HTTP errors | error | |
| conversations.module.ts | 53 | NestJS wiring | module | |
| rag/conversation-rag-client.port.ts | 52 | port token+types | port | |
| conversation-safety.service.ts | 49 | safety classify | service | |
| rag/conversation-rag-client.service.ts | 101 | RAG HTTP client | service | |
| conversation-grounding.service.ts | 39 | chunk selection | service | |
| conversation-context.service.ts | 36 | history loading | service | |
| conversation-citation-mapper.ts | 34 | citation mapping | service | |
| conversation-static-responses.ts | 31 | static-route fn | helper | |
| conversation-follow-up-rewrite.service.ts | 31 | follow-up rewrite | service | |
| conversation-prompt-builder.ts | 30 | prompt assembly | service | |
| conversation-follow-up-detector.ts | 13 | follow-up detect | helper (@Injectable) | |
| conversation-system.prompt.ts | 19 | prompt constants | constants | |
| conversation-access.service.ts | 27 | eligibility | service | |
| conversation-idempotency.service.ts | 23 | idempotency | service | |
| conversation-failure-metadata.ts | 25 | failure code fns | helper | |
| conversation.constants.ts | 27 | limits/fallbacks | constants | |
| conversation-router.service.ts | 9 | wraps pure fn | service | |
| conversation-insufficient-evidence.ts | 5 | returns constant | helper | |
| conversation.repository.ts | 100 | persistence | repository | |

## 3. Responsibility Map (NestJS categories)

| Category | Files |
|---|---|
| **controllers** | conversations.controller.ts |
| **services** | conversation-message, conversation-lifecycle, conversation-safety, conversation-access, conversation-idempotency, conversation-context, conversation-follow-up-rewrite, conversation-grounding, conversation-prompt-builder, conversation-citation-mapper, conversation-router, rag/conversation-rag-client |
| **repositories** | conversation.repository, conversation-message.repository |
| **dto** | conversation.dto.ts |
| **utils/helpers** | conversation-follow-up-detector, conversation-static-responses, conversation-failure-metadata, conversation-insufficient-evidence, conversation-presenter |
| **module/config** | conversations.module.ts, conversation.constants.ts, conversation-system.prompt.ts, conversation.errors.ts |
| **ports** | rag/conversation-rag-client.port.ts |

**Files mixing multiple responsibilities:**
- **`conversation-message.service.ts`** — orchestration + safety-route handling + static routing + RAG search + LLM call + citation mapping + failure persistence + an inline safety regex. The single biggest mixed-responsibility file.
- **`conversation-safety.service.ts`** — owns safety *rules/thresholds* (a Safety-module concern) dressed as a conversation service.
- **`rag/conversation-rag-client.service.ts`** — RAG transport + chunk validation + env config (a RAG/retrieval concern) inside Conversations.
- **`conversation-router.service.ts`** — a 9-line `@Injectable` that only delegates to `conversation-static-responses.ts`; a service wrapping a pure function with no added behavior.

## 4. Module-Boundary Audit

| # | Conversations imports | Owner | Boundary | Why |
|---|---|---|---|---|
| 1 | `CONVERSATION_AI_PORT`, `ConversationAiPort` + types from `../ai/conversation-ai.port` | AI | **GOOD** | Public port contract — exactly the intended seam. |
| 2 | `ConversationLlmAdapter` (concrete) from `../ai/conversation-llm.adapter` (in `conversations.module.ts`) | AI | **VIOLATION** | Conversations registers the AI provider *implementation* itself instead of importing `AiModule` and consuming its exported port. `AiModule` does not even export `CONVERSATION_AI_PORT`; Conversations reached into AI internals to wire it. |
| 3 | `normalizeConversationLlmError` from `../ai/conversation-llm.adapter` (in `conversation-message.service.ts`) | AI | **VIOLATION** | Provider-error normalization is AI-internal knowledge; orchestration now knows LLM failure-code semantics that should be encapsulated behind the port. |
| 4 | `SAFETY_COPY`, `SafetyLevel` from `../safety/safety-definition` | Safety | **QUESTIONABLE** | Constants/types only — semi-public. Acceptable *if* a Safety service were called for the decision. It is not (see #5). |
| 5 | (none) — `conversation-safety.service.ts` hardcodes its own keyword rules: `kill myself`, `suicide`, `self-harm`, `immediate danger` | Safety | **VIOLATION** | Safety rules/thresholds live in Conversations. The Safety module already owns `safety-classifier.ts` + `safety-definition.ts`; free-text classification was invented inside Conversations instead of being a Safety public contract. |
| 6 | (none) — inline regex `/\b(diagnose\|prescribe\|stop medication\|increase medication)\b/i` in `conversation-message.service.ts:410` | Safety | **VIOLATION** | A second, ad-hoc safety/content gate embedded in the orchestrator. |
| 7 | `ConversationRagChunk` used by `conversations/rag/*` (owned here) | RAG | **VIOLATION** | The RAG client implementation (HTTP fetch, timeout, Qdrant-style chunk validation, env config) is owned by Conversations. RAG/retrieval should own external retrieval integration. Duplicated by `coaching/rag/rag-client.service.ts`. |

**Reverse dependency (other module → Conversations internals):**
- `src/modules/ai/conversation-ai.port.ts:1` imports `ConversationRagChunk` **from `../conversations/rag/conversation-rag-client.port`**. AI depends on Conversations — **VIOLATION** of the one-way direction. The chunk shape is a retrieval-domain concept shared into AI; it should not be owned by Conversations.

**Leakage summary:** Ollama/OpenAI-specific logic is *not* inside Conversations (provider classes correctly live in `ai/`); Qdrant-specific chunk validation *is* inside Conversations (`rag/conversation-rag-client.service.ts`); Safety thresholds/rules *are* inside Conversations; Coaching logic is not imported. The provider-impl wiring and the error-normalizer import are the AI-side leaks.

## 5. Dependency-Direction Findings

Actual map:
```text
Conversations
├── AI public port (conversation-ai.port)              GOOD (one-way)
├── AI concrete adapter (conversation-llm.adapter)     REVERSE-ish: wiring impl in Conversations
├── AI error normalizer (conversation-llm.adapter)     LEAK: impl knowledge in Conversations
├── Safety constants (safety-definition)               one-way, but rules duplicated here
├── RAG client implementation (owned here)            WRONG owner
└── PrismaModule

AI (conversation-ai.port)
└── Conversations (ConversationRagChunk)               REVERSE DEPENDENCY ← circular risk
```

Findings:
- **Circular/reverse:** `ai/conversation-ai.port` → `conversations/rag/conversation-rag-client.port`. AI depends on Conversations. This is the only true reverse edge and the root of a latent import cycle.
- **No module imports Conversations internals** except `app.module.ts` (the module itself). Confirmed via grep — Conversations is otherwise a clean leaf.
- **Repositories depend only on `PrismaService`** — no upward dependency on services. Good.
- **Utils do not depend on NestJS application layers** (pure functions only), though several are decorated `@Injectable` without need.
- **No coaching/onboarding/profile imports** from Conversations — direction is clean on that side.

Desired (one-way):
```text
Conversations → AI public contract
Conversations → Safety public contract
Conversations → RAG/retrieval public contract
Conversations → Prisma (infra)
```

## 6. Large-File Findings (`conversation-message.service.ts`, 457 lines)

**Current responsibilities (all in one `send()` + 4 privates):**
1. Idempotency-key validation + eligibility + conversation lookup.
2. Idempotent replay.
3. User-message persistence.
4. Safety routing (failed / safety-hold / none).
5. Static/system-command routing.
6. Follow-up detection + rewrite (insufficient-context / failed / ok).
7. RAG-unavailable / AI-unavailable fallback.
8. RAG search + failure mapping.
9. Grounding (sufficient-chunks check).
10. Prompt building + LLM call + output validation + **inline safety regex**.
11. Citation mapping.
12. Assistant-message persistence (success + 4 failure variants).
13. Conversation `touchAfterMessage` on every exit path.
14. Failure logging + failure-code normalization.

**Natural extraction candidates (by responsibility, not by line count):**

| Extract to | Responsibility moved | Est. lines out | Remaining |
|---|---|---:|---:|
| `conversation-message.service.ts` (orchestrator only) | The `send()` skeleton: load → dispatch → persist → touch | ~150 | 150 |
| `conversation-safety.service.ts` (already exists, keep as port) | Safety-decision handling + the inline `diagnose|prescribe` regex moves out of orchestrator into a Safety-owned decision | ~50 | — |
| `conversation-response-persistor` (new thin helper/service) | All `createAssistantMessage` failure/success writes + `touchAfterMessage` pattern (currently repeated 8×) | ~120 | — |
| `conversation-rag.service` (RAG search + failure-code mapping) | `searchRagSafely` + `ragFailureCode` + grounding handoff | ~40 | — |
| `conversation-llm.service` (LLM generation + output validation) | `generateAnswerSafely` + `mapCitationsSafely` (minus the safety regex, which leaves) | ~40 | — |

After split, the orchestrator shrinks to ~150 lines and the 8 duplicated persist+touch blocks collapse into one. **Regression risk: HIGH** — this is the hot path (`send`) with idempotency, safety ordering, and 4 distinct failure surfaces; behavior must be byte-identical (failure codes, statuses, routes, metadata fields, ordering of writes).

No other file exceeds 300 lines.

## 7. Repository Findings

| Check | Result |
|---|---|
| Persistence separated from orchestration? | **Yes.** Both repositories contain only Prisma calls + row shaping. |
| Repositories contain business-flow decisions? | **No.** No routing/safety/LLM logic. |
| Services contain raw Prisma that belongs in repositories? | **One exception:** `conversation-access.service.ts` queries `onboardingState` directly via a local `Db` wrapper rather than through a repository. Minor — it is a tiny eligibility read, but it is a service doing a raw Prisma `findFirst`. |
| Repository return shapes conversation-domain focused? | **Yes.** `ConversationRow`, `ConversationMessageRow`, `AssistantMessageSourceRow` are domain rows; the presenter converts to DTOs. |

**Violations:** only the `ConversationAccessService` raw query (minor). Repositories themselves are clean.

## 8. Service Findings

| Service | Primary responsibility | Clear today? | Calls repos directly? | Orchestrates other modules? | Provider-specific logic? | Duplicates logic? | Keep as service? |
|---|---|---|---|---|---|---|---|
| ConversationMessageService | Orchestrate a send | **No — mixed (see §6)** | Yes (both repos) | Yes (safety, router, RAG, AI, follow-up) | No (delegates), **but imports AI error normalizer** | No | Yes (slimmed) |
| ConversationLifecycleService | CRUD lifecycle | Yes | Yes (both repos) | No | No | No | Yes |
| ConversationSafetyService | Free-text safety classify | Yes (but **wrong module**) | No | No | No | **Yes — duplicates Safety rules** | Move to Safety |
| ConversationAccessService | Eligibility gate | Yes | **Raw Prisma** (no repo) | No | No | No | Yes (move query to repo) |
| ConversationIdempotencyService | Idempotent replay lookup | Yes | Yes (message repo) | No | No | No | Yes |
| ConversationContextService | Load+trim recent history | Yes | Yes (message repo) | No | No | No | Yes |
| ConversationFollowUpRewriteService | AI follow-up rewrite | Yes | No | Yes (AI port) | No | No | Yes |
| ConversationGroundingService | Chunk selection | Yes | No | No | No | No | Yes |
| ConversationPromptBuilder | Prompt assembly | Yes (trivial) | No | No | No | No | Could be util |
| ConversationCitationMapper | Citation mapping | Yes | No | No | No | No | Could be util |
| ConversationRouterService | Static-route dispatch | Yes (trivial — 9 lines) | No | No | No | No | **Should be util, not service** |
| ConversationRagApiClientService | RAG HTTP client | Yes (but **wrong module**) | No | No | **Qdrant-style validation** | **Yes — `coaching/rag` duplicate** | Move to RAG module |

## 9. DTO/Schema Findings

- `conversation.dto.ts` — zod schemas (`create/list/get/patch/send`) + inferred types + response DTO interfaces. **Clean.** No orchestration.
- `conversation-presenter.ts` — row→DTO mapping with `*RowLike` structural interfaces. **Clean.**
- Validation lives in `ZodValidationPipe` at the controller; DTOs carry no business logic.
- `conversation.errors.ts` — typed `ConversationHttpException` with a `ConversationErrorCode` union. Clean; note the union includes RAG/LLM/SAFETY codes, so the error vocabulary spans module boundaries (acceptable since these surface through the conversation API).

**Duplicates/misplacements:** None in DTOs. The `*RowLike` interfaces in the presenter partially duplicate the repository `*Row` interfaces (same shape, two definitions) — a minor structural duplication, not a behavior risk.

## 10. Utility/Helper Findings

| Helper | Pure? | Currently | Recommendation |
|---|---|---|---|
| conversation-follow-up-detector.ts | Yes | `@Injectable` (but `new`'d manually in orchestrator) | Keep as **utility**; drop `@Injectable` (the orchestrator already `new`s it, so DI is unused) |
| conversation-static-responses.ts | Yes | plain fn | Keep as **utility** (Conversation-owned) |
| conversation-failure-metadata.ts | Yes | plain fns | Keep as **utility** (Conversation-owned failure-code allowlist) |
| conversation-insufficient-evidence.ts | Yes | 1-line wrapper over a constant | **Inline** into caller (or merge into constants) — no value as a unit |
| conversation-citation-mapper.ts | Yes | `@Injectable` (manual `new`) | Keep as **utility**; the `@Injectable` is dead (manual `new`) |
| conversation-prompt-builder.ts | Yes | `@Injectable` (manual `new`) | Keep as **utility**; `@Injectable` is dead |
| conversation-system.prompt.ts | Constants | plain const | Keep as **constants** (product copy; Conversation-owned) |

> Note: four collaborators are `new`'d manually inside `ConversationMessageService`'s constructor (followUpDetector, context, followUpRewrite, grounding, promptBuilder, citationMapper) while several are also declared `@Injectable` in the module. The `@Injectable` decoration on these is currently **dead** — they are never injected; the orchestrator instantiates them directly. This is a DI smell to fix in the refactor (inject them, or make them plain utils) — do not convert to services without need.

## 11. Test-Organization Findings

Current layout:
```text
tests/unit/conversations/        (16 spec files)
tests/contract/conversations/     (3 spec files)
tests/e2e/conversations/          (11 spec files)
tests/integration/rag/            (1 — conversation-python-rag)
tests/helpers/                    (conversation-fixtures, fake-conversation-llm[1-line re-export],
                                    conversation-auth-fixtures, fake-conversation-rag-client)
```

| Test file | Lines | Verifies | Current folder | Proposed folder | Note |
|---|---:|---|---|---|---|
| conversation-schema.spec.ts | 22 | zod schema validation | unit/conversations | unit/conversations/dto | |
| conversation-dto.spec.ts | 39 | DTO validation | unit/conversations | unit/conversations/dto | |
| conversation-access.spec.ts | 30 | eligibility gate | unit/conversations | unit/conversations/services | |
| conversation-idempotency.spec.ts | 37 | idempotent replay | unit/conversations | unit/conversations/services | |
| conversation-router-static.spec.ts | 26 | static/system routes | unit/conversations | unit/conversations/utils | tests pure fn |
| conversation-follow-up-detector.spec.ts | 16 | follow-up detect | unit/conversations | unit/conversations/utils | |
| conversation-failure-metadata.spec.ts | 12 | failure-code fns | unit/conversations | unit/conversations/utils | |
| conversation-retrieval-outcomes.spec.ts | 60 | grounding/retrieval outcomes | unit/conversations | unit/conversations/services | |
| conversation-citation-mapper.spec.ts | 93 | citation mapping | unit/conversations | unit/conversations/utils | |
| conversation-context-window.spec.ts | 29 | history trim budget | unit/conversations | unit/conversations/services | |
| conversation-prompt-builder.spec.ts | 71 | prompt assembly | unit/conversations | unit/conversations/utils | |
| conversation-safety-routing.spec.ts | 31 | conversation-safety.service | unit/conversations | **→ unit/safety** (follows the service when it moves) | tests the Safety-leak service |
| conversation-llm-adapter.spec.ts | 214 | `ai/conversation-llm.adapter` | unit/conversations | **→ unit/ai** | tests AI-owned source |
| conversation-ollama-cloud-provider.spec.ts | 269 | `ai/ollama-conversation-llm.provider` | unit/conversations | **→ unit/ai** | tests AI-owned source |
| conversation-llm-failures.spec.ts | 29 | `ai` error normalizer + citation mapper | unit/conversations | **split:** AI part → unit/ai; citation part → unit/conversations/utils | mixed module coverage |
| conversation-ai-ports.spec.ts | 42 | `ai/fake-conversation-ai.adapter` | unit/conversations | **→ unit/ai** | tests AI-owned fake |
| contract: api / message / rag | 29/23/90 | API contracts | contract/conversations | keep | |
| e2e (11 files) | 15–153 | lifecycle, send, safety, static, follow-up, insufficient-retrieval, redaction-audit, acceptance-matrix, rag-answer, failure-retry, safety-redaction | e2e/conversations | keep | |
| integration/conversation-python-rag | 53 | live RAG client | integration/rag | **→ integration/rag** stays, but follows RAG client when it moves out of Conversations | |

**Issues:**
- **4 unit specs test AI-owned source** (`conversation-llm-adapter`, `conversation-ollama-cloud-provider`, `conversation-llm-failures` [part], `conversation-ai-ports`) — they live under `conversations/` only because the AI module has no test folder. These should follow the source into `tests/unit/ai/`.
- **`conversation-safety-routing.spec.ts`** locks in the leaked safety keyword rules; when the rules move to Safety, this test must move too and be rewritten against the Safety contract (behavior-preserving).
- **Duplicate coverage:** `conversation-llm-failures.spec.ts` mixes AI error-normalization with citation-mapper coverage in one file — should split.
- **Missing high-risk regression coverage:** the `send()` orchestration has 8 distinct exit paths (safety-failed, safety-hold, static, follow-up-insufficient, follow-up-failed, rag-unavailable, rag-timeout/invalid, llm-failure, citation-failure, success). E2e covers many, but there is **no unit-level test of `ConversationMessageService.send` itself** — it is only exercised through e2e/contract. Before splitting this service (§6), a focused unit test of each exit path is the single most important pre-refactor gap.
- `tests/helpers/fake-conversation-llm.ts` is a 1-line re-export — dead indirection; inline or remove.

## 12. Proposed Target Conversation Structure

```text
conversations/
├── conversations.module.ts
├── controllers/
│   └── conversations.controller.ts
├── services/
│   ├── conversation-message.service.ts        (slimmed orchestrator)
│   ├── conversation-lifecycle.service.ts
│   ├── conversation-access.service.ts
│   ├── conversation-idempotency.service.ts
│   ├── conversation-context.service.ts
│   ├── conversation-follow-up-rewrite.service.ts
│   ├── conversation-grounding.service.ts
│   └── (optional) conversation-response-persistor.ts   ← only if §6 split is approved
├── repositories/
│   ├── conversation.repository.ts
│   └── conversation-message.repository.ts
├── dto/
│   ├── conversation.dto.ts
│   └── conversation-presenter.ts
├── utils/
│   ├── conversation-follow-up-detector.ts
│   ├── conversation-static-responses.ts
│   ├── conversation-citation-mapper.ts
│   ├── conversation-prompt-builder.ts
│   ├── conversation-failure-metadata.ts
│   └── conversation-insufficient-evidence.ts
└── constants/
    ├── conversation.constants.ts
    ├── conversation.errors.ts
    └── conversation-system.prompt.ts
```

**What leaves Conversations (not relocated internally — moved out of the module):**
- `rag/conversation-rag-client.service.ts` → a `rag`/`retrieval` module (owned by RAG/retrieval). The **port** can stay as the public contract but should be co-owned/moved so AI no longer reverse-imports from Conversations.
- `conversation-safety.service.ts` → `safety` module (free-text classifier becomes a Safety public contract).
- The inline `diagnose|prescribe` regex → Safety.
- The `ConversationLlmAdapter` wiring → `AiModule` (export `CONVERSATION_AI_PORT` from `AiModule`; Conversations imports `AiModule`).
- `normalizeConversationLlmError` import → removed (AI returns normalized failure codes through the port).

No AI provider implementation is placed inside Conversations. No deep hierarchy — only the standard six folders, plus a small `constants/` because there are already three constant/error files.

## 13. Move / Split / Leave-Unchanged

### A. Move only (already well-designed, poorly located)
| File | Why |
|---|---|
| `rag/conversation-rag-client.service.ts` | Correctly built (port-based, isolated) but wrong *module* — belongs to RAG/retrieval. |
| `rag/conversation-rag-client.port.ts` | Move with the client; removes the AI→Conversations reverse edge. |
| `conversation-safety.service.ts` | Correct shape, wrong module — belongs to Safety (free-text classifier). |
| `conversations.controller.ts` | Fine as-is → relocate into `controllers/`. |
| Both repositories | Fine → relocate into `repositories/`. |
| `conversation.dto.ts`, `conversation-presenter.ts` | Fine → relocate into `dto/`. |
| All utils/helpers (follow-up-detector, static-responses, citation-mapper, prompt-builder, failure-metadata, insufficient-evidence) | Fine → relocate into `utils/` (and drop dead `@Injectable` where applicable). |
| `conversation.constants.ts`, `conversation.errors.ts`, `conversation-system.prompt.ts` | Fine → relocate into `constants/`. |
| Lifecycle/access/idempotency/context/follow-up-rewrite/grounding services | Fine → relocate into `services/`. |

### B. Split (multiple responsibilities or >300 lines)
| File | Split into | Why | Risk |
|---|---|---|---|
| `conversation-message.service.ts` (457) | (a) slimmed orchestrator, (b) response-persistor, (c) RAG search helper, (d) LLM-generation helper; plus move safety handling + inline regex out to Safety | 14 responsibilities in one file; 8 duplicated persist+touch blocks; inline safety regex | **HIGH** |
| `conversation-llm-failures.spec.ts` | AI error-normalization part → `unit/ai`; citation-mapper part → `unit/conversations/utils` | One file covers two modules | Low |

### C. Leave unchanged
| File | Why |
|---|---|
| `conversation-lifecycle.service.ts` | Small, focused, clean. |
| `conversation-idempotency.service.ts` | Small, focused. |
| `conversation-access.service.ts` | Small (only its raw-Prisma query is a minor smell; the service itself is fine). |
| `conversation-context.service.ts` | Small, focused. |
| `conversation-grounding.service.ts` | Small, focused. |
| `conversation-follow-up-rewrite.service.ts` | Small, focused. |
| `conversation-follow-up-detector.ts` | Pure, focused (only the `@Injectable` decoration is dead). |
| `conversation-static-responses.ts` | Pure, focused. |
| `conversation-failure-metadata.ts` | Pure, focused. |
| `conversation-citation-mapper.ts` | Pure, focused (only dead `@Injectable`). |
| `conversation-prompt-builder.ts` | Pure, focused (only dead `@Injectable`). |
| `conversation.dto.ts`, `conversation-presenter.ts`, `conversation.errors.ts`, `conversation.constants.ts`, `conversation-system.prompt.ts` | Clean. |
| Both repositories | Clean. |
| `conversation-router.service.ts` | Leave the *function*; the service wrapper is removable but that is a delete, not a split — bundle with §B orchestrator work. |
| `conversation-insufficient-evidence.ts` | Trivial; leave (or inline in §B). |

## 14. Safe Refactor Sequence

Each phase leaves the app buildable and tests green.

1. **Baseline lock** — capture current unit/e2e/contract/lint/build (§15) as the reference; tag the commit.
2. **Add the missing `ConversationMessageService.send` unit tests** for all 8 exit paths *before* any move. This is the safety net for the HIGH-risk split. (Tests-only; no production change.)
3. **Pure relocations (no behavior change)** — create `controllers/ services/ repositories/ dto/ utils/ constants/` and move files with `git mv`; update import paths and `conversations.module.ts` provider list. Run unit + e2e + build.
4. **Drop dead `@Injectable`** on the 4 manually-`new`'d utils (or, conversely, inject them via DI and stop `new`-ing) — pick one consistent approach. Run tests.
5. **Move RAG client out** of Conversations into a RAG/retrieval module; move the port so AI imports from RAG, not Conversations (removes the reverse edge). Wire `CONVERSATION_RAG_CLIENT_PORT` from the new module. Run tests.
6. **Move free-text safety classification out** of Conversations into Safety (new Safety public contract); replace `conversation-safety.service.ts` with a port call; move the inline `diagnose|prescribe` regex into Safety. Move `conversation-safety-routing.spec.ts` to `tests/unit/safety`. Run tests.
7. **Fix AI boundary** — export `CONVERSATION_AI_PORT` from `AiModule`, import `AiModule` in `ConversationsModule`, remove the direct `ConversationLlmAdapter` import; remove the `normalizeConversationLlmError` import (let AI surface normalized codes via the port). Run tests.
8. **Move the 4 AI-owned unit specs** to `tests/unit/ai/` (and split the mixed failures spec). Run tests.
9. **Split `conversation-message.service.ts`** (§6) — extract response-persistor + RAG-search + LLM-generation helpers; collapse the 8 persist+touch blocks. Run tests after each extraction.
10. **Reorganize remaining tests** into `unit/conversations/{services,utils,dto}`.
11. **Full backend regression** — unit + e2e + contract + integration + lint + build.

Phases 3–8 are low-risk moves; phase 9 is the only HIGH-risk step and is done last, after the boundary fixes and after the new unit safety net (phase 2) is in place.

## 15. Current Validation Baseline

| Check | Command | Result |
|---|---|---|
| Conversation unit tests | `npx vitest run tests/unit/conversations` | **16 files / 77 tests — PASS** (exit 0) |
| Conversation e2e + contract | `npx vitest run --config vitest.config.e2e.ts tests/e2e/conversations tests/contract/conversations` | **11 files / 25 tests — PASS** (exit 0) |
| Backend lint (module + conv tests) | `npx eslint src/modules/conversations tests/unit/conversations tests/e2e/conversations tests/contract/conversations` | **PASS** (exit 0, no output) |
| Backend build | `npx nest build` | **PASS** (exit 0) |
| File-size violations (>300 lines) | — | **1 file:** `conversation-message.service.ts` (457) |

This is the behavior-preservation reference. Every refactor phase must reproduce these green results.

## 16. Refactor Risks (ranked)

### High
- **Splitting `ConversationMessageService.send`** — 8 distinct exit paths with exact failure codes, statuses, routes, metadata fields, and write/touch ordering. Any path divergence changes persisted rows and API responses. Mitigation: phase-2 unit safety net first; extract one helper at a time; run e2e after each.
- **Moving the RAG client + port out of Conversations** — removes the AI→Conversations reverse edge; touches `conversation-ai.port.ts` (AI) and the wiring of both Conversations and Coaching (which has its own duplicate RAG client). Risk of breaking the shared `ConversationRagChunk` contract used by AI. Mitigation: keep the type shape byte-identical; move first, deduplicate with coaching later.
- **Moving free-text safety classification to Safety** — the keyword rules and the `__safety_check_throw__` test hook are currently locked by `conversation-safety-routing.spec.ts` and e2e safety tests. Behavior (route=failed/safety/none, copy text, failureCode) must not change. Mitigation: port-based replacement with identical decision shape; move the test with the code.

### Medium
- **AI wiring change** (import `AiModule` instead of registering `ConversationLlmAdapter` directly) — `AiModule` currently does not export `CONVERSATION_AI_PORT`; adding the export + provider changes DI resolution. `@Optional()` injection in `ConversationMessageService` must still resolve correctly when AI is unconfigured. Mitigation: verify the disabled/unconfigured path (LLM_UNAVAILABLE) in tests.
- **Removing `normalizeConversationLlmError` import** — orchestration currently normalizes AI errors itself; shifting that responsibility onto AI changes where failure codes are produced. The safe-failure-code allowlist in `conversation-failure-metadata.ts` must still reject unknown codes identically.
- **DI change for the 4 manually-`new`'d utils** — switching to injection (or to plain non-`@Injectable` utils) changes construction; the `ConversationContextService(messages)` manual construction in particular depends on the message repository being available at construction time. Verify no construction-order assumption breaks.
- **Test relocation of AI-owned specs** — import paths use `../../../src/modules/...`; moving spec files changes depth. Mechanical but error-prone on Windows paths.

### Low
- **Folder reorganization (phase 3)** — pure `git mv` + import-path updates; behavior unchanged. Risk is only broken imports, caught immediately by build.
- **Dropping dead `@Injectable` / inlining `conversation-insufficient-evidence.ts`** — no behavioral effect; covered by existing tests.
- **Removing the 1-line `fake-conversation-llm.ts` re-export helper** — only test indirection; update the few importers.
- **Presenter `*RowLike` duplication** — structural only; no runtime effect. Can be consolidated opportunistically.

---

**Summary:** The Conversation Module is small (1800 lines, one fat file) and its repositories/DTOs/lifecycle are clean. The real problems are boundary violations, not size: (1) Safety rules live in Conversations (a dedicated service + an inline regex), (2) the RAG client implementation is owned by Conversations with an AI→Conversations reverse dependency through the shared chunk type, (3) Conversations wires the AI provider implementation directly and imports an AI-internal error normalizer, and (4) the orchestrator mixes 14 responsibilities with 8 duplicated persist+touch blocks. The recommended sequence fixes boundaries (low-risk moves) before the one HIGH-risk orchestrator split, gated by a missing unit-test safety net for `send()`.

No code has been modified. Awaiting review and approval before any refactor.