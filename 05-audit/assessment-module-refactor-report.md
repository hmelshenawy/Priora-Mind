# Assessment Module Structural Refactor Report (Task E)

Scope: `02-BACKEND/src/modules/assessment/**` + only imports/tests that must change mechanically because Assessment files move, plus one sanctioned shared-helper extraction (Phase 4).

Verdict: **Behavior-preserving structural refactor complete.** 13 source files moved into the standard folder layout, 1 shared service extracted to remove verbatim duplication between the two orchestrators, 2 unit tests reorganized. Zero behavior changes — lifecycle/submit/scoring/safety/onboarding semantics all unchanged. All gates green except the known pre-existing AI lint error (not Assessment, not introduced here).

---

## 1. Before Assessment tree

15 files, 13 flat at the module root + `ports/` (1):

```
src/modules/assessment/
├── assessment.controller.ts
├── assessment.dto.ts
├── assessment.errors.ts
├── assessment.module.ts
├── assessment-answer-store.service.ts
├── assessment-definition.ts
├── assessment-definition-view.ts
├── assessment-deletion.service.ts
├── assessment-lifecycle.service.ts
├── assessment-result.service.ts
├── assessment-result-mapping.ts
├── assessment-submit.service.ts
├── result-presenter.ts
├── scoring.service.ts
└── ports/
    └── assessment-deletion.port.ts
```

## 2. After Assessment tree

16 files (15 original + 1 extracted `AssessmentOnboardingService`). `repositories/` intentionally NOT created (Assessment uses direct Prisma access + `AssessmentAnswerStore`; introducing a repository layer would redesign persistence ownership, which this phase forbids):

```
src/modules/assessment/
├── assessment.module.ts                 (root — wiring only)
├── controllers/
│   └── assessment.controller.ts
├── services/
│   ├── assessment-answer-store.service.ts
│   ├── assessment-deletion.service.ts
│   ├── assessment-lifecycle.service.ts
│   ├── assessment-onboarding.service.ts   (NEW — extracted shared helper)
│   ├── assessment-result.service.ts
│   ├── assessment-submit.service.ts
│   └── scoring.service.ts
├── dto/
│   ├── assessment.dto.ts
│   ├── assessment-definition-view.ts
│   └── result-presenter.ts
├── utils/
│   └── assessment-result-mapping.ts
├── constants/
│   ├── assessment-definition.ts
│   └── assessment.errors.ts
└── ports/
    └── assessment-deletion.port.ts        (stayed)
```

## 3. Before/after line counts

Move-only files keep identical line counts; the two orchestrators shrank (verbatim methods extracted) and the new shared service holds them. Every handwritten Assessment source file is ≤ 258 lines, well under the 300-line ceiling.

| File | Before | After | Δ |
|---|---|---|---|
| assessment.module.ts | 38 | 40 | +2 (onboarding import + provider) |
| assessment.controller.ts | 83 | 83 | move → controllers/ |
| assessment-lifecycle.service.ts | 290 | 258 | −32 (3 methods extracted) |
| assessment-submit.service.ts | 243 | 211 | −32 (3 methods extracted) |
| assessment-onboarding.service.ts | — | 67 | NEW (extracted) |
| assessment-answer-store.service.ts | 123 | 123 | move → services/ |
| assessment-result.service.ts | 17 | 17 | move → services/ |
| assessment-deletion.service.ts | 66 | 66 | move → services/ |
| scoring.service.ts | 100 | 100 | move → services/ |
| assessment.dto.ts | 223 | 223 | move → dto/ |
| assessment-definition-view.ts | 61 | 61 | move → dto/ |
| result-presenter.ts | 96 | 96 | move → dto/ |
| assessment-result-mapping.ts | 151 | 151 | move → utils/ |
| assessment-definition.ts | 201 | 201 | move → constants/ |
| assessment.errors.ts | 77 | 77 | move → constants/ |
| ports/assessment-deletion.port.ts | 35 | 35 | stayed |
| **Total** | **1804** | **1809** | **+5** (16 files) |

## 4. Every source file moved

13 source files moved (git-tracked renames, history preserved). `assessment.module.ts` and `ports/assessment-deletion.port.ts` stayed in place (module wiring updated; port has no imports).

| Moved from | Moved to |
|---|---|
| assessment.controller.ts | controllers/assessment.controller.ts |
| assessment-lifecycle.service.ts | services/assessment-lifecycle.service.ts |
| assessment-submit.service.ts | services/assessment-submit.service.ts |
| assessment-answer-store.service.ts | services/assessment-answer-store.service.ts |
| assessment-result.service.ts | services/assessment-result.service.ts |
| assessment-deletion.service.ts | services/assessment-deletion.service.ts |
| scoring.service.ts | services/scoring.service.ts |
| assessment.dto.ts | dto/assessment.dto.ts |
| assessment-definition-view.ts | dto/assessment-definition-view.ts |
| result-presenter.ts | dto/result-presenter.ts |
| assessment-result-mapping.ts | utils/assessment-result-mapping.ts |
| assessment-definition.ts | constants/assessment-definition.ts |
| assessment.errors.ts | constants/assessment.errors.ts |

`ports/assessment-deletion.port.ts` — stayed (no imports, unchanged).
`assessment.module.ts` — stayed at root; internal wiring import paths updated + `AssessmentOnboardingService` added as a provider. Cross-module imports (`AuthModule`, `ProfileModule`, `SafetyModule`) unchanged.

## 5. Every test file moved

2 Assessment-owned unit tests moved (git-tracked renames at 50% similarity, history preserved):

| Moved from | Moved to |
|---|---|
| tests/unit/result-presenter.spec.ts | tests/unit/assessment/dto/result-presenter.spec.ts |
| tests/unit/scoring.spec.ts | tests/unit/assessment/services/scoring.spec.ts |

NOT moved (intentionally): no Safety-owned tests were moved (Assessment imports Safety, not vice versa). No mixed-ownership Assessment tests exist beyond these two pure-helper unit tests.

Cross-module importers (tests + seed) left in place; only import paths updated (depth unchanged):
- `tests/contract/assessment.contract.spec.ts` — `assessment-deletion.service` → `services/`, `assessment-definition` → `constants/`.
- `tests/contract/coaching.contract.spec.ts` — `assessment.errors` → `constants/`, `assessment.dto` → `dto/`.
- `tests/contract/safety.contract.spec.ts` — `assessment-definition` → `constants/`.
- `tests/e2e/assessment-submit-idempotency.spec.ts` — `assessment-definition` → `constants/`.
- `tests/e2e/resume-restart.spec.ts` — `assessment-definition` → `constants/`.
- `tests/e2e/coaching-plan.spec.ts` — `assessment.dto` → `dto/`.
- `tests/e2e/safety-routing.spec.ts`, `account-deletion.spec.ts`, `isolation.spec.ts`, `redaction-audit.spec.ts`, `retention-cleanup.spec.ts` — `assessment-definition` → `constants/`.
- `tests/unit/coaching/services/coaching-eligibility.spec.ts` — `assessment.errors` → `constants/`.
- `tests/unit/coaching/services/coaching-generation.spec.ts` — `assessment.dto` → `dto/`.
- `prisma/seed/assessment-definition.ts` — `assessment-definition` → `constants/` (import + a comment reference).

## 6. Every file split/extracted and exact reason

**One extraction: `services/assessment-onboarding.service.ts` (67 lines, new).**

Reason: the audit identified duplicated helper logic between `AssessmentLifecycleService` and `AssessmentSubmitService`. Verification confirmed:

- **`assertCanEnter(userId)`** — VERBATIM identical in both services (calls `contextFor` → `guard.assertCanEnter('assessment', ctx)`).
- **`contextFor(userId)`** — VERBATIM identical in both services (reads `onboardingState`, calls `consent.hasGrantedCurrentConsent`, builds `OnboardingGuardContext`).
- **`transitionOnboarding(userId, target, now)`** — body identical; differs ONLY in the predecessor-states literal (`['ASSESSMENT_PENDING', 'ASSESSMENT_IN_PROGRESS']` vs `['ASSESSMENT_IN_PROGRESS', 'ASSESSMENT_SUBMITTED']`).

The first two are truly verbatim and behaviorally identical → extracted directly. The third is near-verbatim: the differing `pre` array IS the per-caller behavior (which states permit the transition), so it is **parameterized** as `allowedPredecessors: readonly string[]` passed by each caller — each caller's transition semantics are preserved exactly (lifecycle passes its list, submit passes its list). The mechanism (findFirst → membership check → update) is shared verbatim.

The shared `AssessmentOnboardingService` (injectable: `PrismaService` + `ConsentService` + `OnboardingGuardService`) exposes `assertCanEnter(userId)` and `transitionOnboarding(userId, allowedPredecessors, target, now)`. Both orchestrators dropped `consent`/`guard` from their constructors and inject `AssessmentOnboardingService` instead. `touchOnboardingActivity` (lifecycle-only, NOT duplicated) was left in the lifecycle service.

**No other splits.** No service was split merely for size. The orchestrators remain cohesive single-responsibility files (lifecycle 258, submit 211 — both under 300 and now free of the duplicated onboarding-interaction boilerplate). No over-generalized "coordinator framework", no one-method injectable class (the new service has 2 public methods + 1 private), no pass-through wrappers.

## 7. Any characterization tests added

**None.** Phase 2 gate passed: existing tests sufficiently characterize all high-risk behavior. The e2e `resume-restart.spec.ts` covers resume, restart, corrupt-progress re-anchoring (3 tests: stale definition → `requires_safe_restart`, no partial result presented as complete, safe restart re-anchors → single result). The e2e `assessment-submit-idempotency.spec.ts` covers idempotent submit (sequential double-submit, near-concurrent `Promise.all` race, partial-restart→fresh result, cross-user isolation). The contract `assessment.contract.spec.ts` (22 tests) covers access control, definition, save/revise, cross-question consistency, restart, submit completeness, SAFETY_HOLD suppression (GET + POST), restart-not-allowed, and deletion (expired + account). No new characterization tests were required.

## 8. Final responsibility of each Assessment folder

| Folder | Responsibility |
|---|---|
| `assessment.module.ts` (root) | NestJS module wiring: imports `AuthModule`, `ProfileModule`, `SafetyModule`; declares controller + 7 providers (`ScoringService`, `AssessmentAnswerStore`, `AssessmentOnboardingService`, `AssessmentLifecycleService`, `AssessmentResultService`, `AssessmentSubmitService`, `AssessmentDeletionService`) + `ASSESSMENT_DELETION_PORT useExisting`; exports `ASSESSMENT_DELETION_PORT` + `AssessmentResultService`. Explicit wiring, no dynamic modules. |
| `controllers/` | HTTP transport only. `assessment.controller.ts`: getAssessment/getDefinition/saveAnswer/restart/submit/getResult routes, auth guards, JWT payload, delegates to lifecycle + submit services. No business logic. |
| `services/` | Injectable application/domain services. `assessment-lifecycle` (resume/safe-restart/answer-save + per-answer safety), `assessment-submit` (idempotent submit + scoring + result persistence), `assessment-answer-store` (answer persistence + required-set computation), `assessment-result` (result retrieval), `assessment-deletion` (implements `AssessmentDeletionPort`), `scoring` (deterministic scoring), `assessment-onboarding` (shared onboarding-guard + transition interactions). |
| `dto/` | Request/response schemas + presentation mapping. `assessment.dto.ts` (Zod schemas + DTO types + `answerSchemaForQuestionId`/`kindForQuestionId`), `assessment-definition-view.ts` (`buildDefinitionResponse` — pure definition→wire projection), `result-presenter.ts` (`presentResult` + `ResultInsight` — pure non-diagnostic insight assembly). |
| `utils/` | Pure deterministic transformation helpers. `assessment-result-mapping.ts` (`extractCurrentState`, `extractSqAnswers`, `toClassifierDomainScores`, `collectPriorities`, `collectGoalFreeText`, `toResultResponse`, `toScoredResultDto`, `goalFreeTextInput`). No DI, no state. |
| `constants/` | Static domain definitions + errors. `assessment-definition.ts` (the v1.0 definition: domains, questions, bands, labels, maps), `assessment.errors.ts` (HttpException subclasses with stable codes). |
| `ports/` | Assessment-owned contracts. `assessment-deletion.port.ts` (`ASSESSMENT_DELETION_PORT` + `AssessmentDeletionPort` + cutoff/counter types). |

## 9. Any remaining responsibility mixing

Intentionally NOT resolved in this phase (boundary/architecture issues, deferred — see item 20):
- `AssessmentAnswerStore` (services/) owns answer persistence + required-set computation; lifecycle/submit services ALSO do direct Prisma access (`prisma.assessment.update`, `prisma.assessment.findFirst`, `prisma.onboardingState.*`, `prisma.assessmentResult.create/findFirst`). Persistence ownership is split — classified for Boundary Hardening; not redesigned here (Phase 11).
- `assessment.dto.ts` (dto/) contains both Zod schemas AND response interface definitions (`AssessmentView`, `SubmitResponse`, `ResultResponse`, `ScoredResultDto`). A single cohesive DTO file; not split because the types are tightly coupled to the schemas.
- `assessment-definition-view.ts` and `result-presenter.ts` are pure presenters placed in `dto/` (presentation mapping) rather than `utils/`. They are DTO-side projection/presentation, not generic utilities — consistent with the directive's dto candidate list.
- `ScoringService` (services/) has no DI dependencies (no constructor, pure `score` method) but remains `@Injectable`/in `services/` per the existing module wiring and Phase 7 ("do not redesign scoring; if moved structurally, only update imports"). Not converted to a pure util.

No service owns ≥2 clearly independent responsibilities.

## 10. Assessment unit results

`npx vitest run tests/unit/assessment`:

```
Test Files  2 passed (2)
     Tests  20 passed (20)
```

(`tests/unit/assessment/dto/result-presenter.spec.ts` + `tests/unit/assessment/services/scoring.spec.ts`.) Matches baseline 20/20; all green after the moves + extraction.

## 11. Assessment contract results

`npx vitest run tests/contract/assessment.contract.spec.ts`:

```
Test Files  1 passed (1)
     Tests  22 passed (22)
```

All green (run individually — see item 19 on a parallel-run flake). Matches baseline 22/22.

## 12. Assessment e2e / idempotency results

`npx vitest run --config vitest.config.e2e.ts tests/e2e/assessment-submit-idempotency.spec.ts tests/e2e/resume-restart.spec.ts`:

```
Test Files  2 passed (2)
     Tests  11 passed (11)
```

All green. Matches baseline 11/11. Covers resume, restart, corrupt-progress re-anchoring, idempotent submit (sequential + `Promise.all` concurrent), cross-user isolation.

## 13. Relevant Safety regression results

Assessment depends on Safety; the moves did NOT affect Safety imports (Assessment still imports `../safety/*` → `../../safety/*`, mechanical depth update only). Safety tests that exercise Assessment:

- Safety unit (`tests/unit/safety`): **1 file / 23 tests — all green.**
- Safety contract (`tests/contract/safety.contract.spec.ts`): **1 file / 17 tests — all green.**
- Safety e2e (`tests/e2e/safety-routing.spec.ts`, imports `AssessmentModule` + `assessment-definition`): **1 file / 4 tests — all green.**

No Safety regression.

## 14. Relevant Coaching regression results

Coaching consumes Assessment results (`AssessmentResultService`, `ScoredResultDto`). The moves updated the 4 coaching service import paths mechanically (depth unchanged, folder inserted):

- Coaching unit (`tests/unit/coaching` + `reset-test-coaching-plan.spec.ts`): **7 files / 34 tests — all green.**
- Coaching contract (`coaching.contract.spec.ts` + `coaching-rag-boundary.contract.spec.ts`): **2 files / 23 tests — all green.**
- Coaching e2e (`coaching-plan.spec.ts` + `coaching-rag-plan.e2e-spec.ts`): **2 files / 11 tests — all green.**

No Coaching regression. The previously-fixed `coaching-grounding.spec.ts` harness (prior task) remains green.

## 15. Build / typecheck result

- `npx tsc --noEmit -p tsconfig.build.json` → **exit 0**, zero output. Every source import resolves (including the extracted onboarding service, the rewired orchestrator constructors, and all cross-module importers).
- `npx nest build` → **exit 0**.

## 16. Assessment-scope lint result

`npx eslint src/modules/assessment --max-warnings 0` → **exit 0**. Zero Assessment lint errors or warnings (including the new `assessment-onboarding.service.ts`).

## 17. Project-wide lint result (with unrelated separated)

`npx eslint src` → **exit 1**, exactly **1 error, 0 warnings**:

```
src/modules/ai/providers/ollama-conversation-llm.provider.ts
  71:7  error  Unnecessary try/catch wrapper  no-useless-catch
```

This is the **known pre-existing** `no-useless-catch` in the AI module (not Assessment, not introduced or worsened by this refactor). It is out of scope and was diagnosed before work began. Assessment-scope lint is clean.

## 18. git diff --check result

`git diff --check` → no whitespace/conflict errors. The 32 lines of output are all `LF will be replaced by CRLF` line-ending normalization warnings (a Windows checkout artifact, informational only — not whitespace errors). `git diff --check` exits 0.

## 19. Any stale or broken tests discovered

- **Parallel-run flake (not stale, not a real defect):** when running the Assessment contract test concurrently with two other heavy vitest suites (3 parallel `npx vitest run` processes), it once reported `14 passed (22)` with 1 error. Run individually (or even re-run in the same batch), it reliably passes **22/22**. Root cause is resource contention across concurrent vitest processes (supertest agents / in-memory Prisma under CPU starvation), NOT a code defect. The authoritative count is 22/22 (verified alone). No test code changed.
- No stale assertions or broken harnesses were found in Assessment tests. The two moved unit tests pass unchanged after the import-depth rewrite.
- (Pre-existing, out of scope, unchanged: the AI `no-useless-catch` lint error; the `coaching-grounding.spec.ts` harness was already corrected in the prior task and remains green.)

## 20. All cross-module boundary issues intentionally deferred

Mechanical import-path updates were applied where Assessment files moved; ownership/redesign was NOT changed. Each is documented for a future Boundary Hardening phase.

1. **Assessment deep-imports Safety internals.** `assessment.dto.ts` imports `SafetyRoute` from `../../safety/safety.dto`; `assessment-definition-view.ts` imports `SAFETY_QUESTIONS` from `../../safety/safety-definition`; `assessment-submit.service.ts` imports `SAFETY_COPY`, `BilingualEntry` from `../../safety/safety-definition` and `SafetyService`; `assessment-result-mapping.ts` imports `Sq01Code/Sq02Code/Sq03Code` + `ClassifierDomainScore` from `../../safety/safety-definition` + `../../safety/safety-classifier`; `assessment-lifecycle.service.ts` imports `SafetyService` + `SQ02_TRIGGER_CODES`; `assessment-answer-store.service.ts` imports `SQ02_TRIGGER_CODES`. All paths updated mechanically for the move; ownership unchanged. No new Safety port created (Phase 8).
2. **Assessment deep-imports Auth/Profile.** `assessment-onboarding.service.ts` imports `ConsentService` from `../../auth/consent.service` and `OnboardingGuardService`/`OnboardingGuardContext` from `../../profile/onboarding.guard`; `assessment.controller.ts` imports the auth guards + `JwtPayload` from `../../auth/...`. Mechanical path updates only; deep-import boundary not fixed (Phase 9).
3. **Persistence ownership is split.** `AssessmentAnswerStore` owns answer rows, but lifecycle/submit services also do direct Prisma access (`assessment.update/findFirst`, `onboardingState.findFirst/update`, `assessmentResult.create/findFirst`). No repository layer introduced; transaction boundaries unchanged (Phase 11).
4. **`ScoredResultDto` exported by Assessment, consumed by Coaching.** `coaching-eligibility/generation/grounding` import `ScoredResultDto` from Assessment's `dto/assessment.dto`. Path updated; ownership unchanged.
5. **`AssessmentResultService` exported by Assessment, consumed by Coaching.** `coaching-eligibility.service` imports `AssessmentResultService`. Path updated; ownership unchanged.
6. **DTO DRY issues (Phase 10, deferred):** `DOMAIN_ENUM` (zod enum) vs `DomainCode` (union type) in `assessment-definition.ts` vs `assessment.dto.ts` — two representations of the same domain set; `BilingualEntry` is duplicated (defined in both `safety-definition.ts` and `result-presenter.ts`). NOT consolidated — doing so would change public/type ownership. Reported as deferred architecture/DRY issues.
7. **`ScoringService` is a stateless `@Injectable` with no DI.** It could be a pure module, but Phase 7 forbids redesigning scoring; moved as-is into `services/`.

Per the directive, **module boundaries, Safety boundary, and Auth boundary were NOT fixed in this phase**. The refactor only ensured the structural move + extraction did not worsen cross-module direction (item 21).

## 21. Confirmation that lifecycle/submit/scoring/safety/onboarding behavior did not change

- **Lifecycle** (`services/assessment-lifecycle.service.ts`): `getDefinition` / `getAssessment` (incl. corrupt-progress re-anchor: IN_PROGRESS→`requires_safe_restart`, NOT_STARTED→silent re-anchor, SUBMITTED/SCORED/SUSPENDED→leave-as-is) / `saveAnswer` (consent gate, SAFETY_HOLD block, SQ-02 conditional requiredness via `SQ02_TRIGGER_CODES`, cross-validation, NOT_STARTED→IN_PROGRESS transition, per-answer safety `evaluatePerAnswer` for SQ-01/02/03, next-question suppression on HIGH_RISK/CRISIS) / `restart` (SAFETY_HOLD block, SCORED→RESTART_NOT_ALLOWED, answer delete + re-anchor to current definition) — all preserved. The 3 `assertCanEnter` calls now delegate to `AssessmentOnboardingService.assertCanEnter` (verbatim body); the 2 `transitionOnboarding` calls now delegate with `['ASSESSMENT_PENDING','ASSESSMENT_IN_PROGRESS']` passed explicitly (identical predecessor set); `touchOnboardingActivity` (not duplicated) stays inline. Call order, thrown exceptions, transaction boundaries, ZodError propagation, and fail-closed behavior unchanged. Contract (22) + e2e resume-restart (incl. 3 corrupt-progress tests) green.
- **Submit** (`services/assessment-submit.service.ts`): `submit` (consent gate, SAFETY_HOLD suppression, existing-result idempotent early return, corrupt-version fail-closed `AssessmentCorruptException`, required-completeness `IncompleteAssessmentException`, guarded `updateMany` IN_PROGRESS|SUSPENDED→SUBMITTED, race handling via second `findFirst` + fail-closed `IncompleteAssessmentException([])`, deterministic scoring, final `evaluateOnSubmit`, HIGH_RISK/CRISIS suppression, `assessmentResult.create`, →SCORED, `transitionOnboarding`→COMPLETED) / `getResult` (SAFETY_HOLD suppression, 404, DISTRESS note) — all preserved. `assertCanEnter` delegates (verbatim); `transitionOnboarding('COMPLETED')` delegates with `['ASSESSMENT_IN_PROGRESS','ASSESSMENT_SUBMITTED']` passed explicitly. E2e idempotency (sequential + `Promise.all` + partial-restart + cross-user) green.
- **Scoring** (`services/scoring.service.ts`): moved verbatim, only its import of `assessment-definition` updated to `../constants/`. Deterministic scoring, domain ordering, tie-break, band mapping, version compatibility unchanged. Unit (scoring.spec) green.
- **Safety dependencies:** all Safety imports preserved mechanically (path depth updated only). Per-answer safety ordering (save) and on-submit safety ordering (submit) unchanged. `SAFETY_HOLD` save/submit blocking unchanged. Safety unit (23) + contract (17) + safety-routing e2e (4) green.
- **Onboarding transitions:** `AssessmentOnboardingService` holds verbatim copies of the former private methods; the per-caller predecessor lists are passed explicitly, so each transition's semantics (which states permit which target) are byte-for-byte equivalent. The guard entry assertion (`EMAIL_VERIFIED` at route + consent check) is unchanged. Contract verifies `ASSESSMENT_IN_PROGRESS` after first answer and `COMPLETED` after submit.

**Constraints honored:** No public APIs, DTO contracts, Prisma schema, assessment definition content, scoring rules, safety rules, onboarding rules, auth behavior, coaching behavior, persistence semantics, error codes, status transitions, repositories, new cross-module ports, deep-import fixes, Safety/Auth boundary fixes, frontend code, or new features were changed. Safety structural refactoring and Boundary Hardening were not begun.

---

## Stop point

Assessment Module structural refactor complete. Stopping per directive. Safety, Auth, and Boundary Hardening have NOT been begun. Awaiting review.