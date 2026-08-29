# Coaching Module Structural Refactor Report (Task D)

Scope: `02-BACKEND/src/modules/coaching/**` + only imports/tests that must change mechanically because Coaching files move.

Verdict: **Behavior-preserving structural refactor complete.** Move-only — zero source files split, zero lines of behavior changed, zero dead code introduced. All gates green except the two pre-existing failures diagnosed below (neither caused by this refactor, neither in Coaching production code).

---

## 1. Before tree

18 files, 15 flat at the module root + `ports/` (2) + `rag/` (1):

```
src/modules/coaching/
├── coaching.module.ts
├── coaching.controller.ts
├── coaching.dto.ts
├── coaching.errors.ts
├── coaching-action.service.ts
├── coaching-deletion.service.ts
├── coaching-disclaimer.ts
├── coaching-eligibility.service.ts
├── coaching-generation.service.ts
├── coaching-grounding.service.ts
├── coaching-library.ts
├── coaching-lifecycle.ts
├── coaching-plan.service.ts
├── coaching-plan-mapping.ts
├── coaching-plan-validator.ts
├── ports/
│   ├── coaching-deletion.port.ts
│   └── coaching-llm.port.ts
└── rag/
    └── rag-client.service.ts
```

## 2. After tree

18 files, organized into the Conversations/AI convention (`controllers/ services/ dto/ utils/ constants/ ports/ rag/` + root module). Only folders with meaningful contents were created; `repositories/` was intentionally NOT created (no persistence abstraction exists — Prisma is consumed directly by services, and introducing a repository layer would redesign behavior, which this phase forbids):

```
src/modules/coaching/
├── coaching.module.ts            (root — wiring only)
├── controllers/
│   └── coaching.controller.ts
├── services/
│   ├── coaching-action.service.ts
│   ├── coaching-deletion.service.ts
│   ├── coaching-eligibility.service.ts
│   ├── coaching-generation.service.ts
│   ├── coaching-grounding.service.ts
│   └── coaching-plan.service.ts
├── dto/
│   ├── coaching.dto.ts
│   └── coaching-plan-mapping.ts
├── utils/
│   ├── coaching-lifecycle.ts
│   └── coaching-plan-validator.ts
├── constants/
│   ├── coaching.errors.ts
│   ├── coaching-disclaimer.ts
│   └── coaching-library.ts
├── ports/
│   ├── coaching-deletion.port.ts   (stayed)
│   └── coaching-llm.port.ts        (stayed; 1 import path updated)
└── rag/
    └── rag-client.service.ts        (stayed — boundary issue, deferred)
```

## 3. Before/after line counts

Move-only refactor: line counts are identical before and after (import-path string edits do not add/remove lines). Every handwritten Coaching source file is ≤ 209 lines, well under the 300-line ceiling. No file required splitting.

| File | Lines | Destination |
|---|---|---|
| coaching.module.ts | 33 | root (stayed; 7 internal import paths updated) |
| coaching.controller.ts | 51 | controllers/ |
| coaching-generation.service.ts | 209 | services/ (HIGHEST-RISK orchestrator, preserved exactly) |
| coaching-plan.service.ts | 111 | services/ |
| coaching-grounding.service.ts | 116 | services/ |
| coaching-eligibility.service.ts | 55 | services/ |
| coaching-action.service.ts | 63 | services/ |
| coaching-deletion.service.ts | 25 | services/ |
| coaching.dto.ts | 36 | dto/ |
| coaching-plan-mapping.ts | 62 | dto/ |
| coaching-plan-validator.ts | 81 | utils/ |
| coaching-lifecycle.ts | 5 | utils/ |
| coaching.errors.ts | 43 | constants/ |
| coaching-library.ts | 89 | constants/ |
| coaching-disclaimer.ts | 27 | constants/ |
| ports/coaching-deletion.port.ts | 15 | ports/ (stayed) |
| ports/coaching-llm.port.ts | 70 | ports/ (stayed; 1 import path updated) |
| rag/rag-client.service.ts | 88 | rag/ (stayed) |
| **Total** | **1179** | **18 files** |

## 4. Every source file moved

14 source files moved (git-tracked renames, history preserved). Two stayed in place but had import paths updated.

| Moved from | Moved to |
|---|---|
| coaching.controller.ts | controllers/coaching.controller.ts |
| coaching-action.service.ts | services/coaching-action.service.ts |
| coaching-deletion.service.ts | services/coaching-deletion.service.ts |
| coaching-eligibility.service.ts | services/coaching-eligibility.service.ts |
| coaching-generation.service.ts | services/coaching-generation.service.ts |
| coaching-grounding.service.ts | services/coaching-grounding.service.ts |
| coaching-plan.service.ts | services/coaching-plan.service.ts |
| coaching.dto.ts | dto/coaching.dto.ts |
| coaching-plan-mapping.ts | dto/coaching-plan-mapping.ts |
| coaching-plan-validator.ts | utils/coaching-plan-validator.ts |
| coaching-lifecycle.ts | utils/coaching-lifecycle.ts |
| coaching.errors.ts | constants/coaching.errors.ts |
| coaching-library.ts | constants/coaching-library.ts |
| coaching-disclaimer.ts | constants/coaching-disclaimer.ts |

Stayed in place (import paths only):
- `ports/coaching-deletion.port.ts` — no imports, unchanged.
- `ports/coaching-llm.port.ts` — one import updated (`../coaching-library` → `../constants/coaching-library`, because the library moved root→constants/ while the port stays at ports/).
- `rag/rag-client.service.ts` — no imports, unchanged (RAG infrastructure; boundary issue deferred, not moved).
- `coaching.module.ts` — stayed at root; only its 7 internal wiring import paths updated to the new folder locations. Cross-module imports unchanged.

## 5. Every test file moved

6 Coaching-owned unit test files moved (git-tracked renames at 50% similarity, history preserved):

| Moved from | Moved to |
|---|---|
| tests/unit/coaching-generation.spec.ts | tests/unit/coaching/services/coaching-generation.spec.ts |
| tests/unit/coaching-eligibility.spec.ts | tests/unit/coaching/services/coaching-eligibility.spec.ts |
| tests/unit/coaching-grounding.spec.ts | tests/unit/coaching/services/coaching-grounding.spec.ts |
| tests/unit/coaching-lifecycle.spec.ts | tests/unit/coaching/utils/coaching-lifecycle.spec.ts |
| tests/unit/coaching-plan-validator.spec.ts | tests/unit/coaching/utils/coaching-plan-validator.spec.ts |
| tests/unit/coaching-dev-fixtures.spec.ts | tests/unit/coaching/coaching-dev-fixtures.spec.ts |

`coaching-dev-fixtures.spec.ts` is mixed-ownership (constants content + seed idempotency), so it sits flat at the `tests/unit/coaching/` root rather than in a sub-folder — no empty/misleading folder was created.

NOT moved (intentionally):
- `tests/unit/reset-test-coaching-plan.spec.ts` — tests the `scripts/reset-test-coaching-plan` script, not the Coaching module. Left at `tests/unit/` root. No Coaching-module import; unchanged.
- `tests/unit/ai/coaching-llm.adapter.spec.ts` — AI-owned (tests the AI adapter that implements `COACHING_LLM_PORT`). Left at `tests/unit/ai/`. Not moved by this task.
- `tests/contract/coaching.contract.spec.ts` — left at `tests/contract/`; import paths updated (depth unchanged).
- `tests/contract/coaching-rag-boundary.contract.spec.ts` — left at `tests/contract/`; imports `rag/rag-client.service` (stayed), unchanged.
- `tests/e2e/coaching-plan.spec.ts` — left at `tests/e2e/`; import paths updated (depth unchanged).
- `tests/e2e/coaching-rag-plan.e2e-spec.ts` — left at `tests/e2e/`; import paths updated (depth unchanged).

Seed files (not in the Coaching module, but import Coaching constants — discovered via whole-repo importer grep; seeds are excluded from `tsconfig.build.json` so `tsc` did not catch them, but vitest loads them via `coaching-dev-fixtures.spec.ts`):
- `prisma/seed/coaching-library.ts` — import updated to `../../src/modules/coaching/constants/coaching-library`.
- `prisma/seed/coaching-disclaimer.ts` — import updated to `../../src/modules/coaching/constants/coaching-disclaimer`.

## 6. Every file split + reason

**None.** No source file was split. Phase 4 review of the largest/mixed services confirmed each owns a single coherent responsibility:
- `coaching-generation.service.ts` (209 lines) is the generation orchestrator — one cohesive pipeline, not a mix of independent responsibilities. Splitting would redesign the pipeline (forbidden by Phase 5). Under 300 lines.
- `coaching-grounding.service.ts` (116 lines) owns grounding assembly + the pure `buildFocusAreaEvidence` helper co-located with it (kept together — extracting the pure fn into a separate file would be a meaningless micro-extraction).
- All other services are single-responsibility and well under 300 lines.

No file approached the 300-line ceiling. No minimum-meaningful-file principle was violated by creating one-method injectable services, pass-through wrappers, or arbitrary extractions.

## 7. Dead code removed + proof zero consumers

**None removed; none introduced.** This is a move-only refactor — no code was added, deleted, or rewritten. Every moved symbol kept its exact name, signature, and export shape, so every existing consumer resolves unchanged (only the import path string differs). `tsc --noEmit -p tsconfig.build.json` exits 0 (proof every source consumer resolves), and the full Coaching unit suite runs at the baseline count (proof every test/seed consumer resolves via vitest).

## 8. Final responsibility of each folder

| Folder | Responsibility |
|---|---|
| `coaching.module.ts` (root) | NestJS module wiring only: imports `AiModule`, `AssessmentModule`, `AuthModule`, `ProfileModule`, `SafetyModule`; declares/providers the 6 services + `RagApiClientService` + `{COACHING_DELETION_PORT, RAG_CLIENT_PORT useExisting}`; exports `COACHING_DELETION_PORT` + `CoachingDeletionService`. Explicit wiring, no dynamic modules. |
| `controllers/` | HTTP transport only. `coaching.controller.ts`: start/get/accept/updateAction routes, auth guards, JWT payload, delegates to services. No business logic. |
| `services/` | Injectable application/domain services. `coaching-generation` (orchestrator), `coaching-plan` (start/get/accept + supersede), `coaching-grounding` (assembly + RAG), `coaching-eligibility` (eligibility + current-result), `coaching-action` (action update), `coaching-deletion` (implements `CoachingDeletionPort`). |
| `dto/` | Inbound/outbound DTO contracts and presenters. `coaching.dto.ts` (zod `updateActionSchema` + DTO type re-exports); `coaching-plan-mapping.ts` (`toCoachingPlanResponse` / `toGenerationStatusResponse` / `toPlanUnavailableResponse` presenters). |
| `utils/` | Pure deterministic helpers. `coaching-plan-validator.ts` (`validateLlmPlanOutput` — pure domain validation); `coaching-lifecycle.ts` (`recomputePlanStatus` — pure fn). Not converted to injectable services. |
| `constants/` | Static constants and approved content. `coaching-library.ts` (`COACHING_LIBRARY_V1` + integrity + `approvedLibraryContentAvailable`); `coaching-disclaimer.ts` (`COACHING_DISCLAIMER_V1` + integrity + `approvedDisclaimerContentAvailable`); `coaching.errors.ts` (HttpException subclasses). |
| `ports/` | Coaching-owned contracts. `coaching-llm.port.ts` (`COACHING_LLM_PORT` + `GroundingBundle`/`LlmPlanOutput`/`LlmPlanResult`/`CoachingLlmPort`); `coaching-deletion.port.ts` (`COACHING_DELETION_PORT` + `CoachingDeletionPort`). |
| `rag/` | RAG client infrastructure (boundary issue — see item 20). `rag-client.service.ts` (`RAG_CLIENT_PORT` + `RagClientPort` + `RagApiClientService`). Not moved/redesigned. |

## 9. Remaining responsibility mixing

Intentionally NOT resolved in this phase (boundary issues, deferred — see item 20):
- `coaching-grounding.service.ts` co-locates the pure `buildFocusAreaEvidence` helper with the grounding service. Kept together deliberately; not mixing in the harmful sense.
- `rag/rag-client.service.ts` lives inside the Coaching module but is RAG infrastructure, not Coaching domain. Classified for Boundary Hardening; not moved/redesigned here.
- `ports/coaching-llm.port.ts` exports `GroundingBundle` (a grounding shape) alongside the LLM port contract. AI depends on these types (deferred cross-module issue).
- `coaching-dev-fixtures.spec.ts` is mixed constants-content + seed-idempotency → placed flat at `tests/unit/coaching/` root rather than forced into a sub-folder.

No service owns ≥2 clearly independent responsibilities, so Phase 4 did not mandate any split.

## 10. Coaching unit results

Exact baseline match. `npx vitest run tests/unit/coaching tests/unit/reset-test-coaching-plan.spec.ts`:

```
Test Files  1 failed | 6 passed (7)
     Tests  3 failed | 31 passed (34)
```

- 7 files / 34 tests / 31 pass / 3 fail.
- The 3 failures are the **pre-existing** `coaching-grounding.spec.ts` harness `??` bug (see item 19). Same count and same failure mode as the pre-refactor baseline. No regression introduced; no assertion weakened/rewritten to force a pass.

(The 6 moved Coaching test files alone = 6 files / 27 tests / 24 pass / 3 pre-existing fail. `reset-test-coaching-plan.spec.ts` = 1 file / 7 tests / 7 pass, unchanged.)

## 11. Coaching contract results

`npx vitest run tests/contract/coaching.contract.spec.ts tests/contract/coaching-rag-boundary.contract.spec.ts` (default vitest config):

```
Test Files  2 passed (2)
     Tests  23 passed (23)
```

All green. Contract assertions unchanged; only import paths updated (depth unchanged).

## 12. Coaching e2e results

`npx vitest run --config vitest.config.e2e.ts tests/e2e/coaching-plan.spec.ts tests/e2e/coaching-rag-plan.e2e-spec.ts`:

```
Test Files  2 passed (2)
     Tests  11 passed (11)
```

All green. E2e assertions unchanged; only import paths updated (depth unchanged).

## 13. AI regression results

`npx vitest run tests/unit/ai`:

```
Test Files  4 passed (4)
     Tests  46 passed (46)
```

All green, including `tests/unit/ai/coaching-llm.adapter.spec.ts` which imports the Coaching-owned `COACHING_LLM_PORT` / output types from `ports/coaching-llm.port` (the port stayed in place, so this AI-owned test resolves unchanged). The Coaching refactor did not touch AI production code or AI tests. (The earlier estimate of "5 files/48 tests" was approximate; the actual `tests/unit/ai/` directory contains 4 files / 46 tests, all passing.)

## 14. Conversation characterization / regression results

`npx vitest run tests/unit/conversations`:

```
Test Files  14 passed (14)
     Tests  57 passed (57)
```

All green. Shared imports were NOT affected by this refactor (the Conversation module does not import Coaching internals), so the full Conversation matrix is unaffected. No Conversation file was modified by this task.

## 15. Build / typecheck

- `npx tsc --noEmit -p tsconfig.build.json` → **exit 0** (every source import resolves, including the updated seed imports after the whole-repo grep fix).
- `npx nest build` → **exit 0**.

## 16. Coaching-scope lint

`npx eslint src/modules/coaching --max-warnings 0` → **exit 0**. Zero Coaching lint errors or warnings.

## 17. Project-wide lint (with unrelated separated)

`npx eslint src` → **exit 1**, exactly **1 error, 0 warnings**:

```
src/modules/ai/providers/ollama-conversation-llm.provider.ts
  71:7  error  Unnecessary try/catch wrapper  no-useless-catch
```

This is the **known pre-existing** `no-useless-catch` in the AI module (Task C / AI provider), NOT in Coaching, NOT introduced or worsened by this refactor. It is out of scope for this task and was diagnosed before work began. Coaching-scope lint is clean.

## 18. git diff --check

`git diff --check` → **exit 0**. No whitespace errors, no conflict markers. Output contains only `LF will be replaced by CRLF` line-ending normalization warnings (a Windows checkout artifact, not whitespace errors) — these are informational and do not affect correctness.

## 19. Exact explanation of pre-existing `coaching-grounding.spec.ts` failures

**Root cause: a stale/broken test harness, NOT a Coaching production defect.** No production behavior was changed to make these tests pass, and none is required.

3 tests in `coaching-grounding.spec.ts` fail with `AssertionError: promise resolved "{ …bundle… }" instead of rejecting`:
- `looks up pinned snapshots by exact version and no active flag` (line ~62)
- `fails closed when the library snapshot is missing` (line ~68)
- `fails closed when the disclaimer snapshot is missing or corrupt` (line ~76)

The mock helper (lines 18–34) builds the `prisma()` stub using nullish-coalescing defaults:
```ts
findUnique: vi.fn().mockResolvedValue(
  overrides.library ?? { content: COACHING_LIBRARY_V1.content, integrity: COACHING_LIBRARY_V1.integrity }
)
// and similarly:
overrides.disclaimer ?? { copyEn: COACHING_DISCLAIMER_V1.copy.en, copyAr: ..., integrity: ... }
```

Because `null ?? default` evaluates to `default` (the `??` operator only falls through on `null`/`undefined`, both of which `??` replaces with the right-hand side), passing `{ library: null }` or `{ disclaimer: null }` to simulate a *missing* snapshot returns the **valid default snapshot**, not `null`. Consequently the production fail-closed null-check paths in `coaching-grounding.service.ts` (the `approvedLibraryContentAvailable` / `approvedDisclaimerContentAvailable` gates around lines 49–66) are never exercised, `assemble()` resolves with a bundle, and the `rejects.toBeInstanceOf(PlanUnavailableException)` expectation fails.

The "pinned snapshots" test (line 60) uses all defaults and expects rejection, but with valid content, `NODE_ENV !== 'production'`, and no RAG configured, production legitimately resolves a bundle — so that expectation is also stale.

**Determination:** production fail-closed behavior is intact and correct (verified by reading `coaching-grounding.service.ts:49–66` and the `approved*ContentAvailable` predicates in `constants/`). The failures are a broken test harness (`??` vs an explicit `overrides.library === undefined ? default : overrides.library` distinction, or a missing `overrides.library ?? null` passthrough) that cannot express the "missing snapshot" case. This is a **test-only bug, pre-existing, unrelated to the structural refactor**, and out of scope to fix under a behavior-preserving move-only task. The 3 failures are identical in count and cause to the pre-refactor baseline. Per the directive, no production code was silently changed to make them green.

## 20. All cross-module boundary issues deferred (intentionally not fixed)

These were left behaviorally unchanged; only mechanical import-path updates were applied where a Coaching file moved. Each is documented for a future Boundary Hardening phase.

1. **Coaching consumes AI error normalization.** `coaching-generation.service.ts` imports `normalizeConversationLlmError` from `../../ai/utils/conversation-llm.errors` (AI-owned). Coaching's generation failure path depends on an AI-module utility. Path updated to `../../../ai/utils/conversation-llm.errors` after the move; ownership unchanged.
2. **Coaching consumes AI prompt template.** `coaching-grounding.service.ts` imports `COACHING_PLAN_PROMPT_TEMPLATE` from `../../ai/prompt-templates` (AI-owned). Path updated to `../../../ai/prompt-templates`; ownership unchanged.
3. **AI depends on Coaching-owned port + output types.** `src/modules/ai/services/coaching-llm.adapter.ts` and `tests/unit/ai/coaching-llm.adapter.spec.ts` import `COACHING_LLM_PORT`, `LlmPlanOutput`, `GroundingBundle` from Coaching's `ports/coaching-llm.port`. The port stayed in `ports/`, so AI's import path is unchanged. The contract type ownership (Coaching exporting LLM shapes that AI consumes) is a deferred boundary issue.
4. **RAG infrastructure lives inside Coaching.** `rag/rag-client.service.ts` (RAG HTTP client + `RAG_CLIENT_PORT` + `RagClientPort`) is RAG infrastructure, not Coaching domain. Left in place under `rag/`; not moved/redesigned. Coaching consumes it via the `RAG_CLIENT_PORT` token. Ownership classification deferred.
5. **Retention consumes Coaching deletion.** `COACHING_DELETION_PORT` + `CoachingDeletionService` are exported by `coaching.module.ts` and consumed by the Retention module. Wiring unchanged.
6. **Coaching deep-imports into Assessment/Safety/Auth/Profile.** `coaching-eligibility.service.ts` and `coaching-grounding.service.ts` reach into `../../assessment/assessment.dto`, `../../assessment/assessment.errors`, etc. These are existing cross-module dependencies; path depth updated after the move, direction unchanged. Not fixed.

Per the directive, **module boundaries were not fixed in this phase**. The refactor only ensured the structural move did not worsen cross-module direction (item 21).

## 21. Confirmation that lifecycle / generation / grounding / content behavior did not change

- **Plan lifecycle** (`coaching-plan.service.ts`, `coaching-lifecycle.ts`): `startOrGet` / `getCurrent` / `acceptPlan` / `createOrSupersedeCurrentPlan` (P2002 handling) / `recomputePlanStatus` — moved verbatim, only import paths changed. Contract + e2e suites (23 + 11 tests) green.
- **Plan generation** (`coaching-generation.service.ts`, the HIGHEST-RISK orchestrator): the full pipeline — eligibility/current-plan → approved-content gate → grounding.assemble → version check → llm.generatePlan → `validateLlmPlanOutput` → `mapGraph` → `$transaction` (guarded `updateMany` → READY/PROPOSED + persist focusAreas/goals/actions + attempt READY) → catch → `normalizeConversationLlmError` → `failAttempt`; plus `reclaimIfStale`, `waitForIdle`, in-flight idempotency Map — moved verbatim. No reordering, no merged failure paths, no attempt-numbering/lease/timeout/stale/current-plan-semantics/status-transition/validation-order/persistence-order changes. The 7-test `coaching-generation.spec.ts` characterization suite is green (Phase 2 gate passed: existing tests sufficiently characterize the orchestrator; no new characterization tests were required).
- **Grounding** (`coaching-grounding.service.ts`): `assemble()` — library/disclaimer fetch + integrity + content gate + `buildFocusAreaEvidence` + RAG via `RAG_CLIENT_PORT`; insufficient-grounding and technical-failure paths; no direct Qdrant access — moved verbatim. Score threshold, retrieval request shape, grounding selection, failure normalization all unchanged. `coaching-rag-boundary.contract.spec.ts` (4 tests) green.
- **Development content** (`constants/coaching-library.ts`, `constants/coaching-disclaimer.ts`): `COACHING_LIBRARY_V1` / `COACHING_DISCLAIMER_V1` content, versions, bilingual copy, sha256 canonical integrity, `approvedLibraryContentAvailable` / `approvedDisclaimerContentAvailable` (production fail-closed via `NODE_ENV !== 'production'`), and seed idempotency (`prisma/seed/coaching-library.ts`, `prisma/seed/coaching-disclaimer.ts`) — moved verbatim; `coaching-dev-fixtures.spec.ts` (content + seed idempotency) green.

**Constraints honored:** No public API, DTO contract, Prisma schema, database semantics, plan lifecycle, plan-generation behavior, assessment behavior, Safety behavior, RAG behavior, AI behavior, prompts, score thresholds, content fixtures, production content gates, provider/model configuration, retry behavior, failure codes, failure stages, LLM calls, streaming, agents, frontend code, or module boundaries were changed. Assessment structural refactoring was not begun.

---

## Stop point

Coaching Module structural refactor complete. Stopping per directive. Assessment, Safety, and Boundary Hardening have NOT been begun. Awaiting review.