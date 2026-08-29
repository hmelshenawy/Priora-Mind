# Safety Module Structural Refactor Report (Task F)

Scope: `02-BACKEND/src/modules/safety/**` + only imports/tests that must change mechanically because Safety files move. No extraction, no split — this is a **move-only** structural standardization. All 11 Safety source files were already cohesive and ≤300 lines (max 257), so the directive's rule ("No arbitrary split is required if the file is already cohesive and ≤300 lines") applied: nothing was fragmented.

Verdict: **Behavior-preserving structural refactor complete.** 9 source files moved into the standard folder layout, 1 Safety-owned unit test reorganized. Zero behavior changes — classification, routing, persistence, SafetyHold, and safety-copy semantics all unchanged. All gates green except the known pre-existing AI lint error (not Safety, not introduced here).

---

## 1. Before Safety tree

11 files, 9 flat at the module root + `ports/` (1) + `safety.module.ts`:

```
src/modules/safety/
├── safety.controller.ts
├── safety.dto.ts
├── safety.errors.ts
├── safety.module.ts
├── safety.service.ts
├── safety-classifier.ts
├── safety-definition.ts
├── safety-deletion.service.ts
├── safety-reentry.service.ts
├── safety-route.ts
└── ports/
    └── safety-deletion.port.ts
```

## 2. After Safety tree

11 files (same count — move-only, no extraction). `repositories/` intentionally NOT created (Safety uses direct Prisma access; introducing a repository layer would redesign persistence ownership, which this phase forbids):

```
src/modules/safety/
├── safety.module.ts                       (root — wiring only)
├── controllers/
│   └── safety.controller.ts
├── services/
│   ├── safety.service.ts
│   ├── safety-reentry.service.ts
│   └── safety-deletion.service.ts
├── dto/
│   └── safety.dto.ts
├── utils/
│   ├── safety-classifier.ts
│   └── safety-route.ts
├── constants/
│   ├── safety-definition.ts
│   └── safety.errors.ts
└── ports/
    └── safety-deletion.port.ts             (stayed)
```

## 3. Before/after line counts

Move-only: every file keeps its exact line count. Total unchanged at 1072. Max handwritten file is 257 (`safety.service.ts`) — well under the 300-line ceiling. No file was split or extracted.

| File | Before | After | Δ |
|---|---|---|---|
| safety.module.ts | 34 | 34 | stayed (wiring imports updated) |
| safety.controller.ts | 44 | 44 | move → controllers/ |
| safety.service.ts | 257 | 257 | move → services/ |
| safety-reentry.service.ts | 121 | 121 | move → services/ |
| safety-deletion.service.ts | 73 | 73 | move → services/ |
| safety-classifier.ts | 163 | 163 | move → utils/ |
| safety-route.ts | 39 | 39 | move → utils/ |
| safety.dto.ts | 89 | 89 | move → dto/ |
| safety-definition.ts | 184 | 184 | move → constants/ |
| safety.errors.ts | 33 | 33 | move → constants/ |
| ports/safety-deletion.port.ts | 35 | 35 | stayed |
| **Total** | **1072** | **1072** | **0** (11 files) |

## 4. Every source file moved

9 source files moved (git-tracked renames; history preserved). `safety.module.ts` and `ports/safety-deletion.port.ts` stayed in place (module wiring updated; port has no imports).

| Moved from | Moved to |
|---|---|
| safety.controller.ts | controllers/safety.controller.ts |
| safety.service.ts | services/safety.service.ts |
| safety-reentry.service.ts | services/safety-reentry.service.ts |
| safety-deletion.service.ts | services/safety-deletion.service.ts |
| safety-classifier.ts | utils/safety-classifier.ts |
| safety-route.ts | utils/safety-route.ts |
| safety.dto.ts | dto/safety.dto.ts |
| safety-definition.ts | constants/safety-definition.ts |
| safety.errors.ts | constants/safety.errors.ts |

`ports/safety-deletion.port.ts` — stayed (no imports, unchanged).
`safety.module.ts` — stayed at root; 4 internal wiring import paths updated to the new folders (`./controllers/safety.controller`, `./services/safety.service`, `./services/safety-reentry.service`, `./services/safety-deletion.service`). Cross-module imports (`AuthModule`, `ProfileModule`) unchanged.

## 5. Every test file moved

1 Safety-owned unit test moved (git-tracked rename):

| Moved from | Moved to |
|---|---|
| tests/unit/safety-classifier.spec.ts | tests/unit/safety/utils/safety-classifier.spec.ts |

NOT moved (intentionally): no Assessment-owned or Conversation-owned tests were moved into Safety. Cross-module regression tests remain owned by their current suites (safety-routing e2e, conversation-safety e2e/redaction e2e, assessment contract/e2e). They exercise Safety integration but are NOT Safety-owned, so they stayed in place with only their Safety import paths updated mechanically.

Cross-module test importers left in place; only import paths updated (folder inserted, depth unchanged unless the test itself moved):
- `tests/contract/safety.contract.spec.ts` — `safety-definition` → `constants/safety-definition`; dynamic `await import('.../safety-deletion.service')` → `.../services/safety-deletion.service`.
- `tests/unit/conversations/services/conversation-message-send.spec.ts` — `safety-definition` → `constants/safety-definition`.
- `prisma/seed/safety-definition.ts` — `safety-definition` → `constants/safety-definition` (import + doc comment line 6).
- `prisma/schema.prisma` — doc comment line 600 updated to `constants/safety-definition.ts` (comment-only, behavior-neutral).
- Tests importing only `SafetyModule` (which stayed at root) needed NO change: `tests/e2e/safety-routing.spec.ts`, `tests/e2e/redaction-audit.spec.ts`, `tests/e2e/account-deletion.spec.ts`, `tests/e2e/retention-cleanup.spec.ts`, `tests/e2e/isolation.spec.ts`.

**Migration SQL files were NOT edited** — migrations are immutable historical artifacts (`prisma/migrations/20260730000006_m_safety_def/migration.sql` still references the old path in a comment; this is correct — never edit shipped migrations).

## 6. Every extraction/split and exact reason

**None.** This refactor is move-only. Every Safety source file was already cohesive and under the 300-line ceiling (max 257). Per the directive ("No arbitrary split is required if the file is already cohesive and ≤300 lines"), no file was split or extracted. No over-generalized framework, no one-method injectable class, no pass-through wrapper was introduced.

The one structural *decision* worth recording: the **pure classifier (`safety-classifier.ts`) was placed in `utils/` rather than `services/`**. Rationale: it is a genuinely stateless deterministic module — a pure function (`classifySafety`) with no DI, no state, no I/O, no clocks. The directive explicitly permits this ("A pure classifier may belong here if it is genuinely a stateless deterministic function/module rather than an application service") and forbids redesigning a currently *injectable* classifier — the classifier was **not** injectable, so this is purely organizational with no semantic change. The same reasoning placed `safety-route.ts` (`buildSafetyRoute`, pure) in `utils/`. The three `@Injectable` services (`SafetyService`, `SafetyReentryService`, `SafetyDeletionService`) went to `services/`.

## 7. Any characterization tests added

**None.** Phase 2 gate passed: existing tests sufficiently characterize all high-risk Safety behavior.

Verified coverage:
- **NORMAL / DISTRESS / HIGH_RISK / CRISIS** — `tests/unit/safety/utils/safety-classifier.spec.ts` (23 tests: every code combination, partial-answer intermediate states, highest-risk-wins ordering, SQ-03-never-downgrades, distress pattern ≥3-domains and Mood<25, fail-closed on invalid codes).
- **Assessment per-answer + on-submit evaluation** — `tests/contract/safety.contract.spec.ts` (17 tests: per-answer HIGH_RISK/CRISIS interrupt, on-submit final gating, SAFETY_HOLD routing, copy resolution) + `tests/contract/assessment.contract.spec.ts` (22 tests incl. SAFETY_HOLD suppression on GET + POST) + `tests/e2e/assessment-submit-idempotency.spec.ts` (4) + `tests/e2e/resume-restart.spec.ts` (7).
- **Conversation safety routing** — `tests/unit/conversations/services/conversation-safety-routing.spec.ts` (3) + `tests/unit/conversations/services/conversation-message-send.spec.ts` (20, incl. safety hold, CRISIS copy, technical-failure FAILED path, RAG/LLM bypass) + `tests/e2e/conversations/conversation-safety.e2e-spec.ts` (2) + `tests/e2e/conversations/conversation-safety-redaction.e2e-spec.ts` (1).
- **SafetyHold creation/update/behavior** — `tests/contract/safety.contract.spec.ts` (getHold, historical immutability, re-entry resume/hold) + `tests/e2e/safety-routing.spec.ts` (4).
- **Deterministic trigger/classification** — 23 classifier unit tests.
- **Redaction/logging** — `conversation-safety-redaction.e2e-spec.ts` (1) + the errName coarse-logger behavior exercised across suites.

No new characterization tests were required.

## 8. Final responsibility of each Safety folder

| Folder | Responsibility |
|---|---|
| `safety.module.ts` (root) | NestJS module wiring: imports `AuthModule`, `ProfileModule`; declares controller + 4 providers (`SafetyService`, `SafetyReentryService`, `SafetyDeletionService`, `{SAFETY_DELETION_PORT useExisting}`); exports `SafetyService` + `SAFETY_DELETION_PORT`. Explicit wiring, no dynamic modules. |
| `controllers/` | HTTP transport only. `safety.controller.ts`: `GET /safety/hold` + `POST /safety/reentry` routes, `JwtAuthGuard`+`EmailVerifiedGuard`, JWT payload, delegates to `SafetyService`/`SafetyReentryService`. No business logic. |
| `services/` | Injectable Safety application/domain services. `safety.service.ts` (per-answer + on-submit evaluation, append-only persistence, routing transitions, SAFETY_HOLD page, shared guard/transition helpers), `safety-reentry.service.ts` (POST /safety/reentry orchestration), `safety-deletion.service.ts` (implements `SafetyDeletionPort`: expired + account-deletion cleanup). |
| `dto/` | Safety wire-contract shapes. `safety.dto.ts`: `SafetyRoute`, `SafetyHoldResponse`, `HistoricalEvaluation`, `SafetyReentryBody`, `SafetyReentryResponse` (+ variants), `SafetyActionDto`, `EmergencyResourceDto`. |
| `utils/` | Pure deterministic helpers (no DI, no state, no I/O). `safety-classifier.ts` (the pure `classifySafety` function + `ClassifierInput`/`ClassifierResult`/`ClassifierDomainScore`), `safety-route.ts` (pure `buildSafetyRoute` projecting a level onto the wire route). |
| `constants/` | Static Safety-owned definitions/content + errors. `safety-definition.ts` (v1.0 matrix: `SAFETY_QUESTIONS`, `SAFETY_COPY`, `SAFETY_ACTIONS`, `APPROVED_RESOURCES`, `SQ02_TRIGGER_CODES`, thresholds, `SafetyLevel`/`TriggerContext`/`Sq01Code`/`Sq02Code`/`Sq03Code`/`BilingualEntry` types), `safety.errors.ts` (`SafetyUnavailableException` + `errName`). |
| `ports/` | Safety-owned contracts. `safety-deletion.port.ts` (`SAFETY_DELETION_PORT` symbol + `SafetyDeletionPort` + `SafetyCutoffs`/`DeletionCategoryCounters`). |

Internal dependency direction is clean and acyclic: `services` → `utils` / `constants` / `dto` / `ports`; `utils/classifier` → `constants`; `utils/route` → `constants` + `dto`; `constants/errors` → `constants/definition`; `dto` → `constants`; `controller` → `services` + `dto`. No `constants`/`utils`/`dto` file depends on a `services` file.

## 9. Any remaining responsibility mixing

Intentionally NOT resolved in this phase (boundary/architecture issues, deferred — see item 23):
- `SafetyService` (services/) is the orchestration hub: it owns classification invocation, append-only persistence, routing state transitions, the hold page, AND the shared onboarding-guard/transition helpers reused by `SafetyReentryService`. This is cohesive (one orchestrator coordinating one flow family) and ≤300 lines, so it was NOT split. The shared helpers (`assertCanEnter`, `contextFor`, `persistEvaluation`, `setOnboardingState`) are public on `SafetyService` and reused by `SafetyReentryService` — a deliberate intra-module seam, not responsibility mixing.
- `SafetyService` writes cross-module state directly via Prisma (`OnboardingState`, `Assessment` state in `applyRouting`). This is the documented cross-module-via-Prisma pattern; ownership NOT redesigned (Phase 9).
- `safety-deletion.service.ts` has a file-local `errName()` (lines 72–74) that shadows the exported `errName` in `constants/safety.errors.ts`. It is file-local, behavior-neutral, and pre-existing — left as-is (extracting/consolidating it would be a behavior-adjacent change with no structural benefit; not required by the file-size rule).
- `utils/safety-route.ts` depends on `dto/safety.dto.ts` (type-only `import type`). This is a lateral `utils → dto` type dependency, NOT a `utils → services` dependency, so it does not violate the internal dependency direction. Acceptable; not a mixing issue.

No file owns ≥2 clearly independent responsibilities.

## 10. Safety unit results

`npx vitest run tests/unit/safety/utils/safety-classifier.spec.ts`:

```
Test Files  1 passed (1)
     Tests  23 passed (23)
```

Matches baseline 23/23. All green after the move + import rewrite.

## 11. Safety contract results

`npx vitest run tests/contract/safety.contract.spec.ts`:

```
Test Files  1 passed (1)
     Tests  17 passed (17)
```

All green (run individually — see item 20 on a contention flake). Matches baseline 17/17.

## 12. Safety e2e results

`npx vitest run --config vitest.config.e2e.ts tests/e2e/safety-routing.spec.ts`:

```
Test Files  1 passed (1)
     Tests  4 passed (4)
```

Matches baseline 4/4.

## 13. Assessment regression results

Assessment deeply consumes Safety. All green after the mechanical import-path updates:

| Suite | Result |
|---|---|
| Assessment unit (`tests/unit/assessment`) | 2 files / 20 tests ✅ |
| Assessment contract (`assessment.contract.spec.ts`) | 1 file / 22 tests ✅ (run alone — see item 20) |
| Assessment e2e submit-idempotency (alone) | 1 file / 4 tests ✅ |
| Assessment e2e resume-restart (alone) | 1 file / 7 tests ✅ |

The Assessment clean baseline (documented in the Assessment refactor report) is preserved: 20 + 22 + 11 = 53 tests, all green. Safety behavior exercised by Assessment (per-answer interrupt, on-submit gating, SAFETY_HOLD suppression on GET/POST, corrupt-version fail-closed, restart re-anchor) is unchanged.

## 14. Conversation regression results

Conversations consumes Safety via `ConversationSafetyService`. All green:

| Suite | Result |
|---|---|
| Conversation safety-routing unit | 1 file / 3 tests ✅ |
| Conversation message-send unit (safety hold / CRISIS copy / technical failure / RAG-LLM bypass) | 1 file / 20 tests ✅ |
| Conversation safety e2e | 1 file / 2 tests ✅ |
| Conversation safety-redaction e2e | 1 file / 1 test ✅ |

Total 26/26. Conversation safety routing (HIGH_RISK/CRISIS copy, low-risk distress passthrough, technical-failure FAILED `safety_check_failed` path, bypass of RAG/LLM when Safety handles the message, persisted route/stage/failure metadata) is unchanged.

## 15. Coaching regression results

Required: `coaching-eligibility.service.ts` imports `SafetyService` from Safety (path updated mechanically). Ran the affected Coaching unit tests:

`npx vitest run tests/unit/coaching/services/coaching-eligibility.spec.ts tests/unit/coaching/services/coaching-generation.spec.ts`:

```
Test Files  2 passed (2)
     Tests  11 passed (11)
```

No Coaching regression. (Scope not broadened — Coaching contract/e2e do not import Safety internals directly; they consume `AssessmentResultService`, which is unaffected by Safety moves.)

## 16. Build / typecheck result

- `npx tsc --noEmit -p tsconfig.build.json` → **exit 0**, zero output. Every source import resolves (internal Safety, module wiring, and all cross-module importers: Assessment, Conversations, Coaching).
- `npx nest build` → **exit 0**.

## 17. Safety-scope lint result

`npx eslint src/modules/safety --max-warnings 0` → **exit 0**. Zero Safety lint errors or warnings (including the moved `utils/safety-classifier.ts` and `utils/safety-route.ts`).

## 18. Project-wide lint result (with unrelated failures separated)

`npx eslint src` → **exit 1**, exactly **1 error, 0 warnings**:

```
src/modules/ai/providers/ollama-conversation-llm.provider.ts
  71:7  error  Unnecessary try/catch wrapper  no-useless-catch
```

This is the **known pre-existing** `no-useless-catch` in the AI module (not Safety, not introduced or worsened by this refactor — identical to the Assessment refactor's finding). It is out of scope. Safety-scope lint is clean.

## 19. git diff --check result

`git diff --check` → **exit 0**. The output lines are all `LF will be replaced by CRLF` line-ending normalization warnings (a Windows checkout artifact, informational only — not whitespace errors). No trailing-whitespace, conflict-marker, or whitespace-diff errors.

## 20. Any stale or broken tests discovered

- **Vitest contention flake (pre-existing harness artifact, not a defect):** when a heavy vitest suite (the Assessment contract, or two e2e files in one invocation) runs immediately after another vitest process — even sequential — the first run sometimes reports a dropped count + "1 error" (e.g. Assessment contract once showed `17 passed (22) + 1 error`; running two Assessment e2e files together showed `10 passed (11) + 1 error` with all 11 tests ✓). Re-running the suite alone reliably yields the full clean count (`22 passed (22)`, `4 passed (4)` + `7 passed (7)`). Root cause is resource contention across vitest worker teardown / in-memory Prisma / supertest agents, NOT a code defect. Authoritative counts are the clean single-suite runs reported in items 10–15. No test code changed.
- No stale assertions or broken Safety/Assessment/Conversation harnesses were found. The moved classifier unit test passes unchanged after the import-depth rewrite.
- (Pre-existing, out of scope, unchanged: the AI `no-useless-catch` lint error.)

## 21. Every Assessment → Safety dependency preserved

Assessment deep-imports Safety internals (known boundary issue — NOT fixed here, only paths updated mechanically). Every imported symbol is preserved with its exact name; only the file path changed.

| Assessment file | Safety symbol(s) | Old path | New path |
|---|---|---|---|
| `services/assessment-lifecycle.service.ts` | `SafetyService` | `../../safety/safety.service` | `../../safety/services/safety.service` |
| `services/assessment-lifecycle.service.ts` | `SQ02_TRIGGER_CODES` | `../../safety/safety-definition` | `../../safety/constants/safety-definition` |
| `services/assessment-submit.service.ts` | `SafetyService` | `../../safety/safety.service` | `../../safety/services/safety.service` |
| `services/assessment-submit.service.ts` | `SAFETY_COPY`, `BilingualEntry` | `../../safety/safety-definition` | `../../safety/constants/safety-definition` |
| `services/assessment-answer-store.service.ts` | `SQ02_TRIGGER_CODES`, `Sq01Code`, `Sq02Code`, `Sq03Code` | `../../safety/safety-definition` | `../../safety/constants/safety-definition` |
| `utils/assessment-result-mapping.ts` | `Sq01Code`, `Sq02Code`, `Sq03Code` | `../../safety/safety-definition` | `../../safety/constants/safety-definition` |
| `utils/assessment-result-mapping.ts` | `ClassifierDomainScore` | `../../safety/safety-classifier` | `../../safety/utils/safety-classifier` |
| `dto/assessment-definition-view.ts` | `SAFETY_QUESTIONS` | `../../safety/safety-definition` | `../../safety/constants/safety-definition` |
| `dto/assessment.dto.ts` | `SafetyRoute` | `../../safety/safety.dto` | `../../safety/dto/safety.dto` |

All 9 Assessment → Safety import sites updated. No symbol renamed, no export removed, no runtime behavior changed. Verified by Assessment unit (20) + contract (22) + e2e (11) all green.

## 22. Every Conversation → Safety dependency preserved

Conversation deep-imports Safety internals (known boundary issue — NOT fixed here, only paths updated mechanically):

| Conversation file | Safety symbol(s) | Old path | New path |
|---|---|---|---|
| `services/conversation-safety.service.ts` | `SAFETY_COPY`, `SafetyLevel` | `../../safety/safety-definition` | `../../safety/constants/safety-definition` |
| `tests/unit/conversations/services/conversation-message-send.spec.ts` | `SAFETY_COPY` | `../../../../src/modules/safety/safety-definition` | `../../../../src/modules/safety/constants/safety-definition` |

Conversation-owned safety regex / `CONVERSATION_FALLBACKS.safetyTechnical` / `__safety_check_throw__` fixture live in `conversation-safety.service.ts` and `conversation.constants.ts` and were NOT moved into Safety (Phase 8: "Do not move Conversation-owned safety regex or other Conversation logic into Safety during this task. That belongs to Boundary Hardening."). Verified by Conversation safety-routing (3) + message-send (20) + safety e2e (2) + redaction e2e (1) all green.

## 23. All boundary issues intentionally deferred

Mechanical import-path updates were applied where Safety files moved; ownership/redesign was NOT changed. Each is documented for a future Boundary Hardening phase.

1. **Assessment deep-imports Safety internals (9 sites, 7 symbols).** `SafetyService`, `SAFETY_QUESTIONS`, `SAFETY_COPY`, `BilingualEntry`, `Sq01Code/Sq02Code/Sq03Code`, `ClassifierDomainScore`, `SQ02_TRIGGER_CODES`, `SafetyRoute`. Paths updated; ownership unchanged. No new Safety public port created (Phase 7).
2. **Conversation deep-imports Safety internals (2 sites, 2 symbols).** `SAFETY_COPY`, `SafetyLevel`. Paths updated; Conversation-owned safety regex/fallbacks NOT moved into Safety (Phase 8).
3. **Safety deep-imports Auth/Profile.** `SafetyService` imports `ConsentService` (`../../auth/consent.service`) and `OnboardingGuardService`/`OnboardingGuardContext` (`../../profile/onboarding.guard`); `SafetyController` imports `JwtAuthGuard`, `EmailVerifiedGuard`, `JwtPayload` from `../../auth/...`. Mechanical depth updates only; deep-import boundary not fixed.
4. **Safety writes cross-module state via Prisma.** `SafetyService.applyRouting` writes `Assessment.state` (`SUSPENDED`) and `OnboardingState`; `SafetyReentryService.resumeAssessment` writes `Assessment.state` (`IN_PROGRESS`) and `OnboardingState`. The cross-module-via-Prisma pattern is preserved; no repository layer introduced; transaction boundaries unchanged (Phase 9).
5. **Duplicate `BilingualEntry` type** defined in both `safety/constants/safety-definition.ts` and `assessment/dto/result-presenter.ts` (and referenced by `assessment/dto/assessment.dto.ts` indirectly). NOT consolidated — doing so would change shared-type ownership (Phase 10). Reported as deferred DRY/boundary issue.
6. **File-local duplicate `errName`** in `safety/services/safety-deletion.service.ts` shadowing the exported `errName` in `safety/constants/safety.errors.ts`. Pre-existing, behavior-neutral, file-local — left as-is.
7. **`utils/safety-route.ts` → `dto/safety.dto.ts`** type-only dependency. Lateral `utils → dto` dependency; does not violate the internal direction (no `utils → services`). Acceptable; noted for completeness, not a defect.

Per the directive, the Safety boundary, Assessment boundary, Conversation boundary, Auth boundary, and Profile boundary were NOT fixed in this phase. The refactor only ensured the structural move did not worsen cross-module direction.

## 24. Confirmation that classification, routing, persistence, SafetyHold, and safety-copy behavior did not change

This was a **move-only** refactor (no extraction, no split, no code-body change to any production file — only import paths and module wiring). Confirmation by behavior:

- **Classification** (`utils/safety-classifier.ts`): the pure `classifySafety` function body is byte-for-byte unchanged; only its import of `safety-definition` updated to `../constants/safety-definition`. CRISIS (SQ-01=S2, SQ-02=D1, SQ-02=DX after SQ-01∈{S1,S2,SX}), HIGH_RISK (SQ-01=S1/SX + SQ-02=D0), DISTRESS (SQ-03=F2, ≥3 domains <25, Mood<25), NORMAL, highest-risk-wins ordering, SQ-03-never-downgrades, and fail-closed validation are all identical. The 23 classifier unit tests pass unchanged.
- **Routing** (`utils/safety-route.ts`): `buildSafetyRoute` body unchanged; `resume_available` (HIGH_RISK→true, CRISIS→false), `assessment_state` (HIGH_RISK→SUSPENDED, CRISIS→INTERRUPTED), `onboarding_state` (`SAFETY_HOLD`), copy/actions/resources projection all identical. Safety contract (17) + safety-routing e2e (4) green.
- **Persistence** (`services/safety.service.ts`, `services/safety-reentry.service.ts`): the append-only `persistEvaluation` transaction (flip prior `is_current` → create new `is_current=true`), `applyRouting`, `setOnboardingState`, `currentRoute`, `currentLevel`, and the re-entry `resumeAssessment` are all byte-for-byte unchanged; only import paths updated. Transaction boundaries, idempotency, and fail-closed propagation preserved. Assessment contract (22) + e2e (11) + Conversation regression (26) green.
- **SafetyHold** (`services/safety.service.ts` `getHold`): the hold page (latest current evaluation copy + immutable historical list, `can_initiate_reentry`, UNAVAILABLE fallback for unexpected levels) is unchanged. Safety contract covers it green.
- **Safety copy / definitions** (`constants/safety-definition.ts`, `constants/safety.errors.ts`): content is byte-for-byte identical — `SAFETY_QUESTIONS`, `SAFETY_COPY` (DISTRESS/HIGH_RISK/CRISIS/UNAVAILABLE), `SAFETY_ACTIONS`, `APPROVED_RESOURCES`, `SQ02_TRIGGER_CODES`, thresholds (`DISTRESS_DOMAIN_THRESHOLD=25`, `DISTRESS_MIN_DOMAINS=3`, `MOOD_DOMAIN='mood'`), `SAFETY_DEFINITION_VERSION`, all type definitions, and `SafetyUnavailableException` (503 + UNAVAILABLE copy) / `errName`. Only the file location changed. The `SAFETY_UNAVAILABLE` fail-closed code is unchanged.
- **SafetyService orchestration order** (Phase 6): `evaluatePerAnswer` (classify → HIGH_RISK/CRISIS-only persist + applyRouting → return route; else no row), `evaluateOnSubmit` (classify with domain scores → persist final → defensive HIGH_RISK/CRISIS routing → return id+level), and re-entry (assertCanEnter → re_evaluate check → parse → classify → persist → resume-or-hold) call orders are unchanged. Fail-closed (503 `SafetyUnavailableException`) behavior on any classifier throw is unchanged.

**Constraints honored:** No public APIs, classification behavior, routes, trigger codes, safety copy, assessment behavior, conversation behavior, Prisma schema, SafetyHold semantics, repositories, new cross-module ports, Assessment/Conversation deep-import fixes, shared-type consolidation, AI/LLM/RAG safety classification, frontend code, Auth/Profile/Retention refactoring, or Boundary Hardening were changed. The Safety public API (`SafetyService` export + `SAFETY_DELETION_PORT`) was not expanded.

---

## Stop point

Safety Module structural refactor complete. Stopping per directive. Auth, Profile, Retention, and Boundary Hardening have NOT been begun. Awaiting review.