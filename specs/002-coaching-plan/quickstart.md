# Quickstart — 002-coaching-plan

**Purpose**: End-to-end validation recipe for the feature, mapped to acceptance scenarios (US1–US6, SC-001..SC-017, AC-X1..X13) and the required coaching-library fixtures. This is a manual + automated validation guide, not a setup tutorial; it assumes the stack from plan.md is running and that feature 001 is complete.

**Date**: 2026-08-01

---

## 0. Preconditions

- PostgreSQL running; Prisma migrations applied including the new **`20260801000002_m_coaching`** (two independent plan-status enums — `CoachingPlanStatus` (PlanStatus) = `PROPOSED | ACTIVE | COMPLETED` and `CoachingGenerationStatus` (GenerationStatus) = `PENDING | GENERATING | READY | FAILED` — plus `ActionStatus`; models `CoachingPlan` / `FocusArea` / `Goal` / `ActionStep` / `CoachingPlanGeneration`; reference tables `CoachingActionLibrary` / `CoachingDisclaimer`; `UserAccount.coachingPlans` back-relation; partial unique index `coaching_plan_current_one_per_user` enforcing one current plan per user). `CoachingPlan` now carries `planStatus` (nullable **PlanStatus**, `null` until generation succeeds; default `null`) and `generationStatus` (default `PENDING`) as **independent** columns, plus lease metadata `generationStartedAt` / `generationDeadlineAt` and a nullable `currentAttemptId` reference to the in-flight `CoachingPlanGeneration` row; `CoachingPlanGeneration` gains a `deadlineAt` (lease expiry for that attempt). `ActionStep` retains its own `status` column (`ActionStatus`: `INCOMPLETE`|`COMPLETE`) — distinct from `planStatus`/`generationStatus`. The timestamp is on the current date (2026-08-01), ordered after `20260801000001_m_preferences_timezone_nullable` per feature-001's midnight convention.
- Async-execution runtime: a **tracked in-process generation runner** (singleton, Coaching-owned; registry of in-flight attempts keyed by `planId`/`currentAttemptId` with AbortSignals; triggered by `POST` start + `GET`/`POST` reclaim) — no Redis, no job queue, but **no untracked fire-and-forget Promise** either. This requires a **long-running containerized NestJS API process** (the deployment per plan.md); if the deployment were serverless/scale-to-zero the execution trigger would be NEEDS CLARIFICATION (A18/FR-006f). Recorded as a launch-verification item below.
- Reference content seeded: `CoachingActionLibrary` v1.0 + `CoachingDisclaimer` v1.0 are **grounding sources** for generation (library grounds + constrains allowed ids; disclaimer pins approved-scope copy). Selection at generation time is by **exact required-version lookup + integrity verification** against the authoritative `COACHING_LIBRARY_V1` / `COACHING_DISCLAIMER_V1` TS constants — there is **no `isActive`/active-flag column** and no active/approved-flag query. The seed **creates** each versioned row **if the version does not exist**; if it exists, it **verifies stored content + integrity against the constant** — succeeding unchanged when identical, **failing loudly on any difference**, and **never updating or overwriting** an existing version (immutable create-or-verify, not an upsert). Final clinical/legal sign-off (T001) is the content-approval gate — see §Launch gates.
- **Content-gate dependency (T001)**: T001 (provision + approval of the bilingual library + disclaimer) **blocks** production seeding with meaningful content, successful-generation tests that assert real content, real usable plan generation, and feature release. T001 does **NOT block** typed scaffolds (`COACHING_LIBRARY_V1`/`COACHING_DISCLAIMER_V1` shapes with no clinical copy), the schema + migration (`20260801000002_m_coaching`), the provider port + `FakeCoachingLlmAdapter`, the services, or the fail-closed implementation + its tests. **Until T001 is complete, generation MUST return `503 PLAN_UNAVAILABLE` and persist no usable plan** — the feature runs fail-closed, not unblocked.
- Backend (`NestJS`) and frontend (`Next.js`) running over HTTPS; refresh cookie + JWT configured. `AssessmentModule` exports the new `AssessmentResultService`; `CoachingModule` registered in `app.module.ts`; `RetentionModule` imports `CoachingModule`; `AccountDeletionService` injects `COACHING_DELETION_PORT`. The `ai` module adapter implements `COACHING_LLM_PORT` (config-driven provider/model).
- Prompt-template versioning is owned by the `ai` module (`promptVersion` pinned in the grounding bundle); prompt-template review (Constitution III) and provider data-retention/training policy review (Constitution VI) are launch gates — see §Launch gates.
- Test database isolated from production; redaction layer active (research D7 / feature-001 precedent). `tests/helpers/in-memory-prisma.ts` extended with coaching stores + cascades + conditional `updateMany` + count (exempt from the 300-line rule).
- Automated tests use the deterministic **`FakeCoachingLlmAdapter`** (registered for `COACHING_LLM_PORT` in test config); automated tests MUST NOT call live paid providers.

---

## 1. Eligible user receives exactly one plan — US1/US6 — SC-001/SC-003, AC-X2

1. Complete feature-001 to `COMPLETED` with a NORMAL result (use §1 of feature-001 quickstart): registered, email-verified, consented, profile saved, assessment SCORED, `OnboardingState=COMPLETED`, `SafetyService.currentLevel=NORMAL`.
2. `POST /coaching/plan` → `202 Accepted` with `{ plan_id, generationStatus:"PENDING" }` (async generation started; tracked in-process runner + DB-persisted status; no new infra). No plan body yet. The `CoachingPlan` row is created with `generationStatus=PENDING`, `planStatus=null`, and a `currentAttemptId` pointing at the new `CoachingPlanGeneration` attempt row.
3. Poll `GET /coaching/plan` while `generationStatus` is `PENDING`/`GENERATING` → `202` with `{ plan_id, generationStatus }` (poll contract: only `generationStatus` is exposed during generation). The tracked runner atomically claims `PENDING → GENERATING` (conditional `WHERE generationStatus='PENDING'` update), invokes the provider, validates, and on success transitions `generationStatus → READY` and `planStatus → PROPOSED` **atomically** (one transaction). Poll until `200` with `generationStatus:"READY"`, `planStatus:"PROPOSED"`, and the full plan: `plan_version=1`, one or more `focus_areas` (≤3, deduped), `goals`, `actions` (all `INCOMPLETE`), `progress.completed=0`, bilingual `title`/`summary`/`disclaimer`, and `source` = `{ assessment_id, result_id, definition_version, library_version, disclaimer_version }`. **No** domain scores, raw answers, free text, or safety level in the body (FR-017/A10).
4. `GET /coaching/plan` again (reload) → returns the **same** `plan_id` and the `READY`/`PROPOSED` plan without invoking the provider; no new `CoachingPlan` row (one row per `userId+sourceResultId` — AC-X2/SC-003) and **no duplicate provider call** (idempotent post-generation read).
5. Concurrent `POST /coaching/plan` from two tabs on a first-access user → exactly one generation/row created and **at most one** provider call: the atomic claim (`PENDING → GENERATING`) lets only one worker win; the loser re-reads the existing row and returns `202` (research D5/D6).
6. The plan remains `planStatus:"PROPOSED"` (`generationStatus` stays `READY`) until the user **explicitly accepts** it: `POST /coaching/plan/accept` (FR-027a, allowed only when `generationStatus=READY` AND `planStatus=PROPOSED`) → `200` with `planStatus:"ACTIVE"` (acceptance transitions **only** `planStatus: PROPOSED → ACTIVE`; `generationStatus` stays `READY`). Action tracking (`PATCH /coaching/plan/actions/:action_id`) is disabled until `generationStatus=READY` and `planStatus` is `ACTIVE`/`COMPLETED` (Constitution IV — AI-generated plans must be explicitly accepted before activation; `PATCH` while `generationStatus ≠ READY` → `409 PLAN_NOT_READY`; `PATCH` on a `PROPOSED` plan (`generationStatus=READY`, `planStatus ≠ ACTIVE`/`COMPLETED`) → `409 PLAN_NOT_ACTIVE`).

**Pass**: SC-001 (placeholder replaced, no dead-end), SC-003 (one plan), AC-X2 (idempotent start + read).

**One-current invariant (DB-enforced — research D7; spec §7 PlanVersion)**: the partial unique index `coaching_plan_current_one_per_user ON "CoachingPlan"("userId") WHERE "isCurrent" = true` guarantees at most one current plan per user. The MVP single-plan insert (`isCurrent=true`) satisfies it; the row's `planStatus` is `null` while `generationStatus` is `PENDING`/`GENERATING`/`FAILED` and becomes `PROPOSED` only on successful validation. Retake is future and not exercised here, but the contract test should assert that any attempt to create a second `isCurrent=true` row for the same user is rejected by the index (the future regenerate flow must flip the prior `isCurrent=false` first, in one transaction — supersede unchanged). Historical plans' `planStatus` is a frozen snapshot; there is no `SUPERSEDED` planStatus.

## 2. Grounded, validated generation (reproducibility) — US1 — AC-X3, FR-006/FR-010a

1. Run `coaching-plan-validator.spec.ts` + `coaching-generation.spec.ts` against `FakeCoachingLlmAdapter` (deterministic; no live provider) using a fixed `ScoredResultDto` + `COACHING_LIBRARY_V1` + `COACHING_DISCLAIMER_V1` + `promptVersion`.
2. **Reproducibility via fakes**: same grounding bundle + same fake → same validated `READY`/`PROPOSED` plan (title, summary, focus-area set + order + reasons, goals, ordered actions, bilingual disclaimer). Validation success transitions `generationStatus → READY` and `planStatus → PROPOSED` **atomically** (one transaction; FR-006c). LLM output is non-deterministic in production; reproducibility is asserted only with the fake adapter.
3. Focus-area evidence is computed **deterministically** (A6) and passed in the grounding bundle: selected priorities (in ranking order, `source="priority"`) → `supportDomain` (`source="support"`) → lowest-banded remaining domains (score asc, `DOMAIN_ORDER` tie-break, `source="lowest_band"`); deduped; capped at 3. Grounding carries domain codes/bands, `strongestDomain`, `supportDomain`, selected priorities as **CODES** (no raw answers, free-text, or safety data).
4. **Library grounding + constraint**: the LLM output references only approved library keys; `coaching-plan-validator.ts` rejects any `libraryKeys` not present in the pinned `CoachingActionLibrary` version (unknown/retired ids → validation failure → `generationStatus=FAILED`).
5. **Bilingual completeness**: `{en, ar}` both non-empty for every required section (title, summary, focus-area reasons, goals, actions, disclaimer); validator rejects incomplete bilingual output (→ `generationStatus=FAILED`).
6. **Fail-closed (pre-provider)**: missing, corrupt, or failing exact-version lookup or integrity verification against the authoritative TS constant (`CoachingActionLibrary` or `CoachingDisclaimer` grounding) discovered before the provider call → `503 PLAN_UNAVAILABLE`; no provider call, no plan persisted (FR-010a/FR-012). T001 success is the content-approval gate (no `isActive`/approved DB flag).
7. **Fail-closed (post-provider)**: provider failure, malformed/empty output, schema/validation failure, or concerning output (clinical/diagnostic/medication/crisis/scope violation) → `generationStatus=FAILED` (`planStatus` stays `null`), persist **no usable plan**, `GET /coaching/plan` → `503 PLAN_UNAVAILABLE` with `{ generationStatus:"FAILED", retryable:true }`. Retry re-attempts on the **same `CoachingPlan` row** (`generationStatus: FAILED → PENDING`) and creates a **new** `CoachingPlanGeneration` attempt row (the prior `FAILED` attempt row retained for audit).

**Pass**: AC-X3; FR-006/FR-010a.

## 3. Action progress + automatic lifecycle — US2 — SC-005/SC-007/SC-013, AC-X9

1. From §1, after `POST /coaching/plan/accept` (allowed only when `generationStatus=READY` AND `planStatus=PROPOSED`; transitions **only** `planStatus: PROPOSED → ACTIVE`, `generationStatus` stays `READY`) the plan is `ACTIVE`. `PATCH /coaching/plan/actions/{action_id}` `{ "status": "COMPLETE", "expected_version": 1 }` → `200 { action: {status:"COMPLETE", version:2}, progress, planStatus:"ACTIVE" }` (still incomplete actions remain). `PATCH` is enabled only when `generationStatus=READY` AND `planStatus ∈ {ACTIVE, COMPLETED}`.
2. `PATCH` while `generationStatus ≠ READY` (e.g. `PENDING`/`GENERATING`/`FAILED`) → `409 PLAN_NOT_READY` (plan not yet generated). `PATCH` on a `PROPOSED` plan (`generationStatus=READY` but `planStatus ≠ ACTIVE`/`COMPLETED`) → `409 PLAN_NOT_ACTIVE` (plan must be accepted first). The two 409 codes distinguish "not generated yet" from "generated but not accepted" (FR-028/FR-034).
3. Idempotent no-op: `PATCH` the same action to `COMPLETE` again → `200` without bumping `version` (FR-030).
4. Toggle the last `INCOMPLETE` action to `COMPLETE` → `planStatus="COMPLETED"` automatically (AC-X9; touches only `planStatus`, never `generationStatus`; no separate "mark complete" control — FR-022a).
5. Reopen any action: `PATCH { "status": "INCOMPLETE", "expected_version": N }` → `planStatus="ACTIVE"` again (reversible — AC-X9/FR-022b).
6. Reload `GET /coaching/plan` → persisted progress intact (`planStatus`, action statuses, `version`).

**Pass**: SC-005/SC-007/SC-013, AC-X9.

## 4. Concurrent progress updates converge — US2 — AC-X5, FR-033

1. Two clients read the same action at `version=1, INCOMPLETE` (plan is `ACTIVE`).
2. Client A: `PATCH { "status":"COMPLETE", "expected_version":1 }` → `200`, `version=2`.
3. Client B (stale): `PATCH { "status":"COMPLETE", "expected_version":1 }` → `409 ACTION_CONFLICT` (refetch plan, settle to truth).
4. Client B: `PATCH { "status":"INCOMPLETE", "expected_version":2 }` (after refetch) → `200`, `version=3`; plan returns to `ACTIVE` if any action reopened.
5. No lost update, no double-count; final state is consistent regardless of ordering.

**Pass**: AC-X5; FR-033.

## 5. Ownership / isolation — US5 — SC-006/SC-011, AC-X4

1. User A has a plan (from §1); User B authenticates separately and has their own plan (or none yet).
2. User B calls `PATCH /coaching/plan/actions/{A's action_id}` with A's `action_id` → `404 ACTION_NOT_FOUND` (foreign id; same code as unknown id — no existence leak — US5/AC-X4).
3. User B calls `GET /coaching/plan` → only ever their own plan; no plan-id param is accepted (resolved server-side by `userId`); there is no `GET /coaching/plan/:id` (JWT-only ownership).
4. Frontend route-guard bypass (direct URL) is still blocked by the backend; no cross-user read or mutate.

**Pass**: SC-006/SC-011, AC-X4.

## 6. SAFETY_HOLD exclusion — US3 — SC-004, AC-X1

1. From a HIGH_RISK/CRISIS assessment (feature-001 §3), reach `OnboardingState=SAFETY_HOLD`.
2. `POST /coaching/plan` and `GET /coaching/plan` → `409 SAFETY_HOLD` (with `safety_route` if available); no normal plan served and **no generation started** — SAFETY_HOLD/HIGH_RISK/CRISIS never enter generation (pre-gen eligibility+safety gate — FR-004/US3).
3. `PATCH /coaching/plan/actions/{action_id}` for a pre-existing plan after the user enters `SAFETY_HOLD` → `409 SAFETY_HOLD`; mutation blocked (fail-closed) — `PATCH` is blocked for SAFETY_HOLD users regardless of `generationStatus`/`planStatus`.
4. A pre-existing `PROPOSED` plan (`generationStatus=READY`) cannot be accepted if the user entered `SAFETY_HOLD` after generation: `POST /coaching/plan/accept` → `409 SAFETY_HOLD` (acceptance blocked; safety supersedes activation — FR-027a).
5. The user remains in the existing safety flow; the dashboard does not render a normal coaching plan.

**Pass**: SC-004, AC-X1.

## 7. Empty / unavailable / error states — US6 — SC-008

1. `404 RESULT_NOT_FOUND`: a `COMPLETED` user with no scored result (corrupt/inconsistent — A2) → `GET /coaching/plan` 404 → dashboard renders the empty/unavailable state with retry.
2. `503 PLAN_UNAVAILABLE`: missing/corrupt grounding, or grounding failing exact-version lookup or integrity verification against the authoritative TS constant (library or disclaimer) discovered **pre-provider** → `503 PLAN_UNAVAILABLE`; no provider call; dashboard renders fail-closed unavailable + retry; no fabricated plan (FR-010a).
3. `FAILED` representation: provider failure / malformed output / validation failure / concerning output → `generationStatus=FAILED` (`planStatus` stays `null`); dashboard fail-closed unavailable + retry; `GET /coaching/plan` → `503 PLAN_UNAVAILABLE` with `{ plan_id, generationStatus:"FAILED", retryable:true }`. Retry transitions `generationStatus: FAILED → PENDING` on the **same `CoachingPlan` row** and creates a **new** `CoachingPlanGeneration` attempt row (no new plan row; the prior `FAILED` attempt row retained for audit — A18/FR-008). `FAILED` is a GenerationStatus, never a PlanStatus.
4. `403 ONBOARDING_STEP_BLOCKED`: an incomplete user hitting the endpoint → `{ next }` → frontend routes to the authoritative next step (US2/SC-002).
5. `409 PLAN_NOT_READY`: `POST /coaching/plan/accept` on a `PENDING`/`GENERATING` plan → `409 PLAN_NOT_READY` (plan not yet ready for acceptance). Same code when `generationStatus=FAILED` → `409 PLAN_UNAVAILABLE` (retry generation first — FR-027a). Also `PATCH /coaching/plan/actions/:action_id` while `generationStatus ≠ READY` → `409 PLAN_NOT_READY` (plan not yet generated).
6. `409 PLAN_NOT_ACTIVE`: `PATCH /coaching/plan/actions/:action_id` on a `PROPOSED` plan (`generationStatus=READY` but `planStatus=PROPOSED`, i.e. generated but not yet accepted) → `409 PLAN_NOT_ACTIVE` (accept the plan first). This code distinguishes "not accepted" from `PLAN_NOT_READY`'s "not generated yet".
7. Other `ApiError` → dashboard error + `refetch()` retry.

**Pass**: SC-008; FR-012.

## 7a. Async-execution safety (atomic claim, lease, stale reclaim, late-result guard, restart recovery) — AC-X13/SC-017, FR-006f/A18

1. **Atomic claim**: two concurrent `POST /coaching/plan` retries on a plan whose `generationStatus=PENDING` (or a `FAILED → PENDING` retry followed by a concurrent retry) → exactly one `PENDING → GENERATING` conditional update (`WHERE generationStatus='PENDING'`) succeeds; only one provider call starts. The loser re-reads the existing row and returns `202` (no duplicate active provider call — A18/FR-006f).
2. **Tracked runner + lease**: the winning claim sets `generationStartedAt=now()`, `generationDeadlineAt=now()+lease`, and `currentAttemptId` (pointing at the new `CoachingPlanGeneration` row whose `deadlineAt` mirrors the lease). The singleton in-process runner registers the attempt by `planId`/`currentAttemptId` with its `AbortSignal` (observable/cancelable — not an untracked fire-and-forget Promise).
3. **Duplicate POST**: a `POST` while `generationStatus=GENERATING` (lease still alive) → `202` with the same `plan_id` and starts nothing; while `READY` → returns the resource without invoking the provider; while `PENDING` → the atomic claim ensures at most one call. No `POST` ever duplicates an active provider call (FR-008).
4. **Stale reclaim (incl. process restart)**: force the runner to stop responding (simulate a process restart by clearing the in-process registry) and advance the clock past `generationDeadlineAt`. The next `GET`/`POST` sees `generationStatus=GENERATING` AND `now() > generationDeadlineAt` → reclaims: the stale `CoachingPlanGeneration` attempt row is marked `FAILED` with a sanitized `TIMEOUT`/`STALE` error code, `generationStatus` returns to `PENDING`, and `currentAttemptId` is cleared. No manual intervention required (A18).
5. **Late-result guard**: let an expired worker eventually finish (success payload) and attempt to persist. The persist is a conditional update guarded on `generationStatus='GENERATING' AND currentAttemptId=:thisAttemptId`. Because a newer attempt was already claimed (or the plan is already `READY`), `currentAttemptId` no longer matches → the update affects **zero rows** and the late success is discarded. A late success from an expired attempt can never overwrite a newer successful attempt (A18).
6. **Provider timeout**: configured adapter timeout (`FR-006a`) → the attempt transitions `generationStatus → FAILED` (reclaimable); a retry creates a new attempt on the same plan row (A18).
7. **Retry on same row**: a `POST` while `generationStatus=FAILED` transitions `generationStatus: FAILED → PENDING` on the **same current `CoachingPlan` record** and creates a **new** `CoachingPlanGeneration` attempt row; the prior `FAILED` attempt row is retained (audit). No new `CoachingPlan` row is created on retry.

**Pass**: AC-X13/SC-017 (async execution safety); FR-006f/A18. Runtime prerequisite: long-running containerized NestJS process verified (see §Launch gates).

## 8. Bilingual + RTL — US4 — SC-009, FR-035/FR-036

1. Complete the journey with `language_code:"ar"` → plan content rendered in Arabic from the bilingual `{en, ar}` payload; `<html dir="rtl">`.
2. `PUT /me/preferences/language` EN ⇄ AR mid-session → content + direction re-render from the **stored bilingual payload**; **progress preserved** (server state, not reset). Locale switch MUST NOT trigger a separate plan or provider call — generation is language-independent (always bilingual).
3. All UI labels from the `coaching` i18n namespace (no hard-coded strings; `protected.dashboardPlaceholder` removed/repurposed). `PROPOSED`/accept/`FAILED`/ready states are localized.
4. Playwright RTL suite asserts direction, AR/EN/number ordering, keyboard tab order in LTR+RTL, and the accessible progress live region.

**Pass**: SC-009; FR-035/FR-036.

## 9. Accessibility — US4 — SC-008/SC-009, FR-037/FR-038

1. Keyboard-only: tab through focus areas → goals → ordered actions; toggle an action with Enter/Space; visible focus ring in LTR and RTL.
2. Semantic HTML: `<main>`, `<section aria-label>`, `<h1>`/`<h2>`; action toggle as `<button aria-pressed>` or `<input type="checkbox">` with associated label.
3. Progress: `<div role="progressbar" aria-valuenow/min/max>` + `aria-live="polite"` region announcing "K of N actions complete" on every toggle (FR-038).
4. The generation / `PROPOSED` / accept / `FAILED` / ready states are accessible: loading/progress announcements fire during generation (`generationStatus`: `PENDING` → `GENERATING` → `READY`, which atomically sets `planStatus=PROPOSED`), the accept button is keyboard-operable, and the `FAILED`/unavailable state is announced to assistive tech.
5. Screen-reader audit (Playwright + assertions) confirms the announcement fires on completion and on reopen.

**Pass**: SC-008/SC-009; FR-037/FR-038.

## 10. Telemetry redaction — SC-010, FR-039

1. Run the full coaching journey (§1–§5) with a captured log/trace pipeline.
2. Assert no plan content, action copy, focus-area reasons, goals, disclaimer text, completion status, raw assessment scores/answers/free text, or safety levels appear in logs, analytics, traces, or error reports (research D7 redaction unit test + an e2e log-scan assertion).
3. `CoachingPlanGeneration` stores **NO chain-of-thought, NO raw assessment content, NO plan copy** — only references (provider, modelId, promptVersion, source pins: definition/library/disclaimer versions, resultId) + operational metadata (`generationStatus`, validationOutcome, retryCount, tokenUsage, latencyMs, timestamps including lease `deadlineAt`/`started_at`/`finished_at`, sanitized errorCode). The parent `CoachingPlan` carries lease metadata (`generationStartedAt`, `generationDeadlineAt`) and `currentAttemptId` — these are operational references only, no CoT/raw content (FR-006e/FR-006f). Provider request/response content is excluded from logs.
4. Trigger an error mid-`PATCH` (e.g. force a 503) → the error response and trace contain only sanitized counters (`plan_id`, `completed`/`total`); no echo of the action body or plan content.

**Pass**: SC-010; FR-039.

## 11. Retention + account deletion — US5 — SC-006/SC-012, FR-040

1. Scheduled retention: trigger the RetentionModule `@Cron` (or invoke its service directly). Assert the `coaching` category runs as a **no-op** (completed plans retained while the account exists — mirrors feature-001 completed-result retention, Consent §8; forward-compat cutoff only). `DeletionLog.categoryCounts` gains a `coaching` entry `{ deleted:0, errors:0 }`; no content logged (FR-039).
2. Account deletion: from §1 (plan + sub-entities + `CoachingPlanGeneration` rows present), submit an authenticated account-deletion request. Assert `CoachingPlan` + all `FocusArea`/`Goal`/`ActionStep` + `CoachingPlanGeneration` rows removed (cascade via `planId`); `AssessmentResult` removed (feature-001) before coaching; a `DeletionLog` (account_deletion) row records a sanitized `coaching` counter; idempotent on re-submit.
3. Failure injection: make coaching deletion throw → counted as errors, **other categories still complete**; failed rows retry next run (mirrors feature-001 §11).

**Pass**: SC-006/SC-012; FR-040.

## 12. No regression — US6 — SC-011

1. Re-run the feature-001 suites (auth, onboarding, consent, profile, assessment, safety, retention, account-deletion) unchanged.
2. Assert the only feature-001 surface changed is `/dashboard` (placeholder → coaching-plan experience); routing authorities (`GET /onboarding/state` `next_route`, `GET /onboarding/completion` `post_onboarding_route`) and frontend guards (`RequireAuth`/`RequireOnboarding`) behave identically.
3. SAFETY_HOLD routing, assessment submit/result, and safety re-entry are unaffected.

**Pass**: SC-011; US6.

---

## Automated coverage map

| Concern | Suite | Mapping |
|---|---|---|
| Grounded generation (fake provider) | `coaching-generation.spec.ts` (FakeCoachingLlmAdapter) | FR-006/FR-010a, AC-X3 |
| Grounded validation (fake provider) | `coaching-plan-validator.spec.ts` | FR-010a, safety, allowed-ids, bilingual, limits, traceability |
| Generation state machine (fake provider) | `coaching-generation.spec.ts` | Two independent statuses: `generationStatus` PENDING/GENERATING/READY/FAILED + atomic `planStatus` PROPOSED on READY; FAILED is a GenerationStatus never a PlanStatus; idempotency, retry/timeout on same row + new attempt, no duplicate provider calls — AC-X11/SC-015 (generation lifecycle) |
| Async execution safety (atomic claim, lease, reclaim, late-result guard, restart) | `coaching-generation.spec.ts` | FR-006f/A18, AC-X13/SC-017 — atomic `PENDING → GENERATING` claim, lease `generationDeadlineAt`/`deadlineAt`/`currentAttemptId`, stale reclaim after deadline (incl. process restart), late-result guard on `currentAttemptId`, duplicate-POST never duplicates a provider call |
| Generation auditability (no CoT) | `coaching-generation.spec.ts` + `redaction-audit.spec.ts` | `CoachingPlanGeneration` metadata incl. lease `deadlineAt` + parent `currentAttemptId`/lease columns; no chain-of-thought/raw content — AC-X12/SC-016 (auditability) |
| Explicit acceptance | `coaching.contract.spec.ts` | `generationStatus=READY` + `planStatus=PROPOSED` → ACTIVE only via accept (FR-027a); accept/PATCH 409 codes (`PLAN_NOT_READY`/`PLAN_UNAVAILABLE`/`PLAN_NOT_ACTIVE`/`SAFETY_HOLD`) — AC-X10/SC-014 |
| Lifecycle recompute (pure) | `coaching-lifecycle.spec.ts` | FR-022a/FR-022b, AC-X9 |
| Eligibility rules (pure) | `coaching-eligibility.spec.ts` | FR-001/FR-004 |
| API contracts | `coaching.contract.spec.ts` (Nest TestingModule + InMemoryPrisma) | FR-001..FR-033, AC-X1/X2/X4/X5/X9 |
| Idempotent start + read | contract + integration | FR-008/FR-029, AC-X2, SC-003 |
| Concurrent action updates | contract (conditional updateMany + version) | FR-030/FR-033, AC-X5 |
| Ownership / isolation | contract (cross-user action_id → 404) | FR-031/FR-032, SC-006/SC-011, AC-X4 |
| SAFETY_HOLD exclusion | contract + e2e | FR-004, SC-004, AC-X1 |
| Redaction | `redaction-audit.spec.ts` (extended) + e2e log scan | FR-039, SC-010 |
| Account deletion | `account-deletion.spec.ts` (extended) | FR-040, SC-012 |
| Scheduled retention | `retention-cleanup.spec.ts` (extended, no-op/forward-compat) | FR-040, Consent §8 |
| Bilingual + RTL + a11y | Playwright `coaching-plan.spec.ts` | FR-035..FR-038, SC-008/SC-009 |
| Full journey + DB-backed e2e | `coaching-plan.spec.ts` (real isolated DB, 30s timeout) | SC-001/SC-005/SC-007/SC-013 |
| No regression | feature-001 suites re-run unchanged | SC-011, US6 |

## Launch gates (not verified here — external)

- **Clinical sign-off on `CoachingActionLibrary` v1.0** — every focus-area reason, goal, action step, pacing label, title/summary template is approved as non-clinical, in-scope coaching content (spec §16; Constitution I/III). The feature fail-closes (`503 PLAN_UNAVAILABLE`) if a producible focus area's entry is missing; this gate approves the *content* itself before launch.
- **Legal/privacy sign-off on `CoachingDisclaimer` v1.0** — the approved-scope disclaimer wording (EN + AR) (spec §16; Constitution VI).
- **Prompt-template review (Constitution III)** — the `ai` module's prompt templates (`promptVersion`-pinned) are reviewed for non-clinical, in-scope framing; no instructions that invite diagnosis/medication/crisis content; bilingual parity.
- **Provider data-retention / training policy review (Constitution VI)** — the configured LLM provider's data-retention and training policy is reviewed before production; bounded context to provider (assessment evidence + profile + library + disclaimer only; no raw answers/free-text/safety).
- **AI/LLM provider configured via `COACHING_LLM_PORT`** (config-driven; vendor-agnostic); provider data-retention/training policy + prompt templates are launch-gated. The Constitution's AI principles (II/III/IV/VI/VII) are actively satisfied; automated tests use a deterministic fake provider.

**Launch verification item (runtime prerequisite, not a content gate)**: the API process is a **long-running containerized NestJS service** so the tracked in-process generation runner (registry + lease + reclaim) survives between the `202` response and attempt completion (A18/FR-006f/spec §15). If the deployment were serverless or scaled the API process to zero between requests, the in-process runner could not survive and the execution-trigger mechanism would be NEEDS CLARIFICATION (a real queue such as Redis/job-queue would be required, which is out of the approved MVP scope). Verify before launch that the deployment keeps the API process alive; if not, escalate as a planning clarification.