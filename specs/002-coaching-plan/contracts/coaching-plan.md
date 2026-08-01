# API Contract — Coaching Plan

**Feature**: 002-coaching-plan
**Module**: Coaching (CoachingPlan, FocusArea, Goal, ActionStep, CoachingPlanGeneration; hybrid deterministic + LLM plan generation)
**Date**: 2026-08-01
**Base**: `HTTPS`, `/api/v1`. Protected; requires `JwtAuthGuard` + `EmailVerifiedGuard`. `userId` is always taken from `req.user.sub` and never from the body or params (FR-031/FR-032).

> Plan generation is a **hybrid deterministic + LLM** model (Constitution IV permits and governs AI/LLM; spec §10; research D3/D6). **Deterministic** components are authoritative for eligibility, ownership, lifecycle, idempotency, concurrency, safety, grounding-bundle assembly, structured-output **validation**, and version pinning. An **LLM** synthesizes a genuinely personalized bilingual plan (full structured schema) from the grounding bundle; the LLM MUST NOT decide eligibility or safety, and MUST NOT invent diagnoses, clinical content, medication guidance, crisis content, or unsupported user facts. Constitution Principle IV requires that an AI-generated plan be **explicitly accepted** by the user before it becomes `ACTIVE`.
>
> Eligibility is backend-authoritative: `OnboardingState = COMPLETED` + a scored `AssessmentResult` exists + `SafetyService.currentLevel ∈ {NORMAL, DISTRESS}`. `SAFETY_HOLD` / `HIGH_RISK` / `CRISIS` users are excluded and stay in the safety flow (FR-004, US3). Generation is **async start + poll**, in-process with DB-tracked status, and uses **no new infrastructure**. The plan lifecycle is **automatic after acceptance**: `ACTIVE ⇄ COMPLETED` is derived from action progress — there is no separate "mark plan complete" control (FR-022a/FR-022b; research D9).
>
> Generation tracks **two independent status concepts** persisted on `CoachingPlan` (FR-006c): a **GenerationStatus** for one generation attempt and a **PlanStatus** for the plan's lifecycle. A plan has no usable lifecycle/content until `generationStatus = READY`. Successful validated generation transitions `generationStatus → READY` and `planStatus → PROPOSED` **atomically** (one transaction). `FAILED` is a GenerationStatus, **never** a PlanStatus. Async execution is operationally safe without Redis/a job queue: an **atomic claim**, a **tracked in-process runner**, **lease metadata**, **stale recovery**, and a **late-result guard** prevent duplicate provider calls, recover from process restart/timeout, and ensure a late result from an expired attempt can never overwrite a newer successful attempt (A18/FR-006f).

---

## Status enums (two independent concepts)

`CoachingPlan` carries **two independent status columns**:

### GenerationStatus — `CoachingPlan.generationStatus` (default `PENDING`)

One of `PENDING | GENERATING | READY | FAILED`. Tracks the progress of the **current** generation attempt. Also persisted as the `status` field on each `CoachingPlanGeneration` attempt row.

- `PENDING` — row created; grounding bundle not yet assembled / provider call not yet started. The atomic `PENDING → GENERATING` claim has not yet succeeded.
- `GENERATING` — grounding bundle assembled; provider call in flight (or retrying). Bounded by a lease (`generationStartedAt` + `generationDeadlineAt`); reclaimable once `now() > generationDeadlineAt`.
- `READY` — the current attempt's provider output passed deterministic validation; usable plan content is persisted. Atomically sets `planStatus → PROPOSED` (the first time). Subsequent reads return the resource **without invoking the provider**.
- `FAILED` — provider failure, malformed/empty output, validation failure, or missing/corrupt/unapproved grounding; **no usable plan content persisted**; `planStatus` stays `null`. Retried on the **same row** by transitioning `generationStatus: FAILED → PENDING` and creating a **new** `CoachingPlanGeneration` attempt row (the prior `FAILED` attempt row is retained for audit).

### PlanStatus — `CoachingPlan.planStatus` (nullable; `null` until `generationStatus = READY`)

One of `PROPOSED | ACTIVE | COMPLETED`. Tracks the plan's **lifecycle**. Independent of `generationStatus`.

- `PROPOSED` — set **atomically** with `generationStatus → READY` on the first successful validated generation; ready and awaiting explicit user acceptance (Constitution IV). `null` while `generationStatus ∈ {PENDING, GENERATING, FAILED}`.
- `ACTIVE` — user explicitly accepted the `PROPOSED` plan via `POST /coaching/plan/accept` (which transitions **only** `planStatus: PROPOSED → ACTIVE` and does **not** change `generationStatus`); actions are mutable.
- `COMPLETED` — all actions `COMPLETE`; auto-derived from action progress inside the PATCH transaction (no separate "mark plan complete" control). Reopening any action returns the plan to `ACTIVE`.

There is **no `SUPERSEDED` status**. Historical (`isCurrent=false`) plans are frozen with whatever `generationStatus`/`planStatus` they held and are never exposed by any endpoint. `FAILED` is a GenerationStatus, never a PlanStatus.

---

## POST /coaching/plan — start generation (async)

Idempotently create or return the user's current coaching plan from the persisted scored `AssessmentResult` + profile (FR-001/FR-002/FR-005/FR-008/FR-027). Never duplicates an active provider call; never creates a new `CoachingPlan` row on retry.

**Eligibility gate** (run in this order, before any DB read/write):
1. `OnboardingGuardService.assertCanEnter('dashboard', ctx)` (reuses the existing feature-001 `dashboard` step — no new onboarding step is added). Not COMPLETED → `403 ONBOARDING_STEP_BLOCKED { next }`.
2. `SafetyService.currentLevel(userId) ∈ {NORMAL, DISTRESS}`; else → `409 SAFETY_HOLD`.
3. `AssessmentResultService.getScoredResult(userId)` non-null; null → `404 RESULT_NOT_FOUND`.

**Idempotency / resumability / stale recovery** (resolved by `userId` + `isCurrent=true`; no plan-id param):
- `existing = findFirst({ where: { userId, isCurrent: true } })`.
- **Stale recovery (incl. process restart)**: if `existing.generationStatus = 'GENERATING'` AND `now() > existing.generationDeadlineAt` → reclaim: mark the stale `CoachingPlanGeneration` attempt row `FAILED` (sanitized `TIMEOUT`/`STALE`), transition `generationStatus: GENERATING → PENDING` (clear `currentAttemptId`), then proceed as if `PENDING`. No manual intervention (A18/FR-006f).
- If found and `generationStatus ∈ {PENDING, GENERATING}` → return `202 { plan_id, generationStatus }` (no plan body). **No duplicate row, no duplicate provider call.** If `PENDING` and no in-flight attempt, the atomic claim below may start one; if `GENERATING` (lease alive), start nothing.
- If found and `generationStatus = READY` → return `200` with the full plan resource (including `generationStatus: "READY"` and `planStatus`) **without invoking the provider**.
- If found and `generationStatus = FAILED` → **trigger a retry on the SAME row**: transition `generationStatus: FAILED → PENDING` and create a **new** `CoachingPlanGeneration` attempt row (the prior `FAILED` attempt row is retained for audit), then return `202 { plan_id, generationStatus: "PENDING" }` (the worker then claims it; either way the response is `202 PENDING`). Does **not** create a new `CoachingPlan` row.
- If none → create `CoachingPlan` (`generationStatus = PENDING`, `planStatus = null`) + a `CoachingPlanGeneration` row; return `202 { plan_id, generationStatus: "PENDING" }` and kick in-process generation.

**Generation (in-process, async; lease-bounded, tracked)**:
1. **Atomic generation claim**: `UPDATE CoachingPlan SET generationStatus='GENERATING', generationStartedAt=now(), generationDeadlineAt=now()+lease, currentAttemptId=:attemptId WHERE id=:planId AND generationStatus='PENDING'` — a single conditional update; only one worker/request can succeed, so simultaneous retries/claims never start duplicate provider calls. Create the `CoachingPlanGeneration` attempt row (`status='GENERATING'`, `started_at`, `deadline_at`) inside the same transaction. A failed claim (0 rows) → another worker already claimed it; return `202 { plan_id, generationStatus: "GENERATING" }`, start nothing.
2. **Assemble the grounding bundle** (deterministic):
   - Assessment evidence: `ScoredResultDto` — domain scores/bands, `strongestDomain`, `supportDomain`, `selectedPriorities` as **CODES**. **No raw answers, no free-text, no safety data** are passed to the provider.
   - Profile fields (non-sensitive).
   - The pinned `CoachingActionLibrary` row, looked up by the **exact required `libraryVersion`** (exact-version lookup; **no `isActive`/active-flag query**) and integrity-verified against the authoritative `COACHING_LIBRARY_V1` constant — full content; this **grounds and constrains** the allowed `libraryKey` ids (goals/actions MUST reference approved library keys; id-constrained, not a pick-list).
   - The pinned `CoachingDisclaimer` row, looked up by the **exact `disclaimerVersion`** (exact-version lookup) and integrity-verified against `COACHING_DISCLAIMER_V1` — version + copy.
   - `promptVersion` + instructions enforcing scope, safety, structured output, and bilingual `{en, ar}` output.
3. Call `COACHING_LLM_PORT.generatePlan(bundle)` with timeout / retry per config. The attempt is tracked by a singleton in-process generation runner (registry of in-flight attempts by `planId`/`currentAttemptId` with AbortSignals) — not an untracked fire-and-forget Promise.
4. On success, validate the output via `coaching-plan-validator.ts` (deterministic):
   - Schema conformance to the versioned `LlmPlanOutput` (full bilingual `{en, ar}`: `title`, `summary`, `focus_areas[domain, source, reason]`, `goals[libraryKey]`, `actions[libraryKey, position, pacingLabel, copy]`, disclaimer reference).
   - Allowed library ids: every `libraryKey` exists in the pinned library version.
   - Limits: `focus_areas ≤ 3`, action/goal bounds.
   - Safety: no clinical / diagnostic / medication / crisis content; concerning-output detection.
   - Required sections present; assessment traceability; bilingual completeness (`en` + `ar` both non-empty).
5. On validation pass → **atomic success transition** in one `prisma.$transaction`: `generationStatus → READY` AND `planStatus → PROPOSED` (set together — a plan has no usable lifecycle/content until `generationStatus = READY`); persist `CoachingPlan` content + all `FocusArea`/`Goal`/`ActionStep`; mark the attempt row `status='READY'`, `finished_at`. The persist is a **conditional update guarded on `generationStatus='GENERATING' AND currentAttemptId=:thisAttemptId`** — if a newer attempt was already claimed (or the plan is already `READY`), `currentAttemptId` no longer matches → 0 rows → the late result is **discarded**; a late success from an expired attempt can never overwrite a newer successful attempt. `@@unique([userId, sourceResultId])` is the create-time concurrency guard; a concurrent create throws P2002 → catch, re-read, return the existing row.
6. On provider failure, malformed output, validation failure, or missing grounding → **atomic failure transition**: persist **no usable plan content**; `generationStatus → FAILED` (`planStatus` stays `null`); keep the `CoachingPlan` row and write `CoachingPlanGeneration` metadata (`status='FAILED'`, validation outcome / sanitized error code, `finished_at`), guarded on the same `currentAttemptId` conditional. A provider timeout transitions the current attempt `generationStatus → FAILED` (reclaimable) per adapter config; a retry creates a new attempt.

Missing/corrupt grounding, or grounding failing exact-version lookup or integrity verification against the authoritative TS constant (`CoachingActionLibrary` or `CoachingDisclaimer`), discovered **before** the provider call → `503 PLAN_UNAVAILABLE` (synchronous; no provider call, nothing persisted). Provider/validation failures surface as the plan's `generationStatus = FAILED` via `GET`, **not** as a synchronous error, because generation is async.

**202 response** (while `generationStatus` is `PENDING` or `GENERATING`):
```json
{
  "plan_id": "...",
  "generationStatus": "PENDING" | "GENERATING"
}
```
No plan body.

**200 response** (when `generationStatus = READY`): the full plan resource (same shape as `GET`), including `generationStatus: "READY"` and `planStatus`, **without invoking the provider**.

**Errors**:
- `401 UNAUTHENTICATED` — missing/invalid token.
- `403 ONBOARDING_STEP_BLOCKED` — `{ error: { code, next: "<route>" } }`; redirect to the authoritative next onboarding step (US2/SC-002).
- `409 SAFETY_HOLD` — `{ error: { code: "SAFETY_HOLD", safety_route?: {...} } }` (enriched via `SafetyService.currentRoute` if available); generation suppressed (US3/AC-X1).
- `404 RESULT_NOT_FOUND` — no scored result (A2); dashboard renders the empty/unavailable state with retry.
- `503 PLAN_UNAVAILABLE` — missing/corrupt grounding, or grounding failing exact-version lookup or integrity verification against the authoritative TS constant (`CoachingActionLibrary` or `CoachingDisclaimer`), discovered before the provider call (pre-provider grounding failure; no provider call, nothing persisted) (FR-010a/FR-012; research D3). T001 success is the content-approval gate (no `isActive`/approved DB flag).
- `500 INTERNAL` — `{ error: { code: "INTERNAL" } }` via `AllExceptionsFilter`.

---

## GET /coaching/plan — retrieve current plan / poll status

Return the user's current coaching plan, or poll its generation status (FR-001/FR-002/FR-005/FR-008/FR-027). The server resolves the user's current plan by `userId` — **no plan-id param** (JWT-only ownership; no `GET /coaching/plan/:id`).

**Eligibility gate** (same as POST, in this order):
1. `assertCanEnter('dashboard')` → `403 ONBOARDING_STEP_BLOCKED { next }`.
2. `SafetyService.currentLevel ∈ {NORMAL, DISTRESS}` → else `409 SAFETY_HOLD`.
3. `getScoredResult(userId)` non-null → else `404 RESULT_NOT_FOUND`.

**Stale recovery on GET**: if the current plan's `generationStatus = 'GENERATING'` AND `now() > generationDeadlineAt` → reclaim (mark the stale `CoachingPlanGeneration` attempt row `FAILED` with `TIMEOUT`/`STALE`, transition `generationStatus: GENERATING → PENDING`, clear `currentAttemptId`), then return the `PENDING` state (A18/FR-006f). This also recovers from process restart.

**Response by status**:
- `generationStatus = READY` → `200` with the plan body (including `generationStatus: "READY"` and `planStatus: PROPOSED|ACTIVE|COMPLETED`); all bilingual content as `{en, ar}`; **no raw assessment scores, answers, free text, or safety data** — FR-017/A10.
- `generationStatus ∈ {PENDING, GENERATING}` → `202 { plan_id, generationStatus }` (no body) — client polls.
- `generationStatus = FAILED` → `503 PLAN_UNAVAILABLE` with a safe retryable failure representation (no plan content):
```json
{ "plan_id": "...", "generationStatus": "FAILED", "retryable": true }
```

**200 plan body** (all bilingual content as `{en, ar}`):
```json
{
  "plan_id": "...",
  "plan_version": 1,
  "generationStatus": "READY",
  "planStatus": "PROPOSED",
  "source": {
    "assessment_id": "...",
    "result_id": "...",
    "definition_version": "...",
    "library_version": "1.0",
    "disclaimer_version": "1.0",
    "prompt_version": "1.0"
  },
  "title": { "en": "...", "ar": "..." },
  "summary": { "en": "...", "ar": "..." },
  "disclaimer": { "en": "...", "ar": "..." },
  "focus_areas": [
    {
      "id": "...",
      "domain": "stress",
      "source": "priority" | "support" | "lowest_band",
      "position": 1,
      "reason": { "en": "...", "ar": "..." }
    }
  ],
  "goals": [
    { "id": "...", "focus_area_id": "...", "library_key": "...", "position": 1, "copy": { "en": "...", "ar": "..." } }
  ],
  "actions": [
    {
      "id": "...",
      "focus_area_id": "...",
      "goal_id": "..." | null,
      "library_key": "...",
      "position": 1,
      "pacing_label": { "en": "...", "ar": "..." } | null,
      "copy": { "en": "...", "ar": "..." },
      "status": "INCOMPLETE"
    }
  ],
  "progress": { "completed": 0, "total": 6 }
}
```

**Errors**:
- `401 UNAUTHENTICATED`.
- `403 ONBOARDING_STEP_BLOCKED`.
- `409 SAFETY_HOLD`.
- `404 RESULT_NOT_FOUND`.
- `503 PLAN_UNAVAILABLE` — current plan `generationStatus = FAILED` (no usable plan persisted; `retryable: true`), or missing/corrupt grounding / grounding failing exact-version lookup or integrity verification against the authoritative TS constant (FR-010a/FR-012).
- `500 INTERNAL`.

---

## POST /coaching/plan/accept — explicit user acceptance (Constitution IV)

Explicitly accept the `PROPOSED` plan, transitioning **only** `planStatus: PROPOSED → ACTIVE`. Constitution Principle IV requires AI-generated plans be explicitly accepted by the user before activation. This endpoint does **not** change `generationStatus`.

**Eligibility gate** (re-checked; a user who entered `SAFETY_HOLD` after generation cannot activate):
1. `assertCanEnter('dashboard')` → `403 ONBOARDING_STEP_BLOCKED { next }`.
2. `SafetyService.currentLevel ∈ {NORMAL, DISTRESS}` → else `409 SAFETY_HOLD`.
3. `getScoredResult(userId)` non-null → else `404 RESULT_NOT_FOUND`.

**Transition** (allowed ONLY when `generationStatus = READY` AND `planStatus = PROPOSED`):
- `planStatus: PROPOSED → ACTIVE` (only `planStatus` changes; `generationStatus` stays `READY`).
- If `planStatus` is already `ACTIVE | COMPLETED` → `200` idempotent no-op success.
- If `generationStatus ∈ {PENDING, GENERATING}` → `409 PLAN_NOT_READY` (plan is not yet generated).
- If `generationStatus = FAILED` → `409 PLAN_UNAVAILABLE` (cannot accept a failed plan; retry generation first).

**200 response**: `{ plan_id, planStatus: "ACTIVE" }` (or the full plan resource with `generationStatus: "READY"` and `planStatus: "ACTIVE"`).

**Errors**:
- `401 UNAUTHENTICATED`.
- `403 ONBOARDING_STEP_BLOCKED`.
- `409 SAFETY_HOLD` — user entered the safety flow after generation; activation blocked (fail-closed).
- `409 PLAN_NOT_READY` — `generationStatus` is `PENDING`/`GENERATING`.
- `409 PLAN_UNAVAILABLE` — `generationStatus = FAILED`; retry generation first.
- `500 INTERNAL`.

---

## PATCH /coaching/plan/actions/{action_id} — update action completion

Update a single action's completion status (FR-020/FR-028). Auto-recomputes the plan lifecycle in the same transaction (FR-022a/FR-022b; AC-X9). Available only when `generationStatus = READY` AND `planStatus ∈ {ACTIVE, COMPLETED}`.

- **Path**: `action_id` (UUID). Ownership validated via the `plan.userId` join (FR-031/FR-032): `actionStep.findFirst({ where: { id: action_id, plan: { userId, isCurrent: true } } })`. Not found (foreign **or** unknown) → `404 ACTION_NOT_FOUND` — same code, no existence leak (US5/AC-X4).
- **Plan-state guard**:
  - If `generationStatus ≠ READY` (`PENDING`/`GENERATING`/`FAILED`) → `409 PLAN_NOT_READY` (plan is not yet generated).
  - If `generationStatus = READY` but `planStatus = PROPOSED` → `409 PLAN_NOT_ACTIVE` (plan must be accepted first).
  - Allowed only when `generationStatus = READY` AND `planStatus ∈ {ACTIVE, COMPLETED}`.
- **Body** (Zod `updateActionSchema` via `ZodValidationPipe`):
  ```json
  { "status": "INCOMPLETE" | "COMPLETE", "expected_version": 1 }
  ```
  `expected_version` is optional; when present it is used as the optimistic-concurrency guard (FR-033; research D8).
- **Idempotent no-op**: if the action's `status` already equals the requested `status`, return success without writing (FR-030; AC-X5).
- **Concurrent-safe update**: conditional `updateMany({ where: { id, status: { in: [oldStatus] }, ...(expected_version ? { version: expected_version } : {}) }, data: { status, version: { increment: 1 }, updatedAt: new Date() } })`; `count === 0` → re-read: if already at target → no-op success, else → `409 ACTION_CONFLICT` (client refetches the plan) (AC-X5).
- **Lifecycle recompute (same transaction)**: `incompleteCount = actionStep.count({ where: { planId, status: 'INCOMPLETE' } })`; `newPlanStatus = recomputePlanStatus(incompleteCount)` (`0 → COMPLETED`, else `ACTIVE`); write `coachingPlan.planStatus` + `updatedAt` (FR-022a/FR-022b). This touches **only `planStatus`** — it never changes `generationStatus`. Only `ACTIVE ⇄ COMPLETED` ever results from a PATCH — `PROPOSED`/`PENDING`/`GENERATING`/`FAILED`/`null` never result from a PATCH.

**200**:
```json
{
  "action": { "id": "...", "status": "COMPLETE", "version": 2 },
  "progress": { "completed": 6, "total": 6 },
  "plan_status": "COMPLETED"
}
```

**Errors**:
- `400 VALIDATION` — `{ error: { code: "VALIDATION", fields } }` (localized, FR-035).
- `401 UNAUTHENTICATED`.
- `403 ONBOARDING_STEP_BLOCKED` — a user who left `COMPLETED` (rare) is redirected.
- `404 ACTION_NOT_FOUND` — foreign or unknown `action_id` (no leak).
- `409 SAFETY_HOLD` — the user entered the safety flow after plan activation; mutation blocked (fail-closed).
- `409 PLAN_NOT_READY` — `generationStatus ≠ READY` (`PENDING`/`GENERATING`/`FAILED`); plan is not yet generated.
- `409 PLAN_NOT_ACTIVE` — `generationStatus = READY` but `planStatus = PROPOSED`; must be accepted first.
- `409 ACTION_CONFLICT` — `{ error: { code: "ACTION_CONFLICT" } }`; stale `expected_version` or a concurrent toggle; client refetches the plan.
- `500 INTERNAL`.

---

## Provider abstraction & generation metadata

- **Port**: `COACHING_LLM_PORT` (Symbol token) + `CoachingLlmPort { generatePlan(bundle): Promise<LlmPlanResult> }`, owned by the Coaching module (`coaching/ports/coaching-llm.port.ts`).
- **Adapter**: a new `ai` module implements the adapter; provider and model are **config-driven**; secrets are kept **server-side** only; token / latency / timeout / retry / rate-limit / cost controls are enforced per config.
- **Tests**: `FakeCoachingLlmAdapter` (deterministic) is used for automated tests — automated tests MUST NOT call live paid providers.
- **CoachingPlanGeneration (one row per attempt)**: each generation attempt is persisted in a `CoachingPlanGeneration` audit row — `attempt`, `provider`, `modelId`, `promptVersion`, source pins (`sourceAssessmentId`/`sourceResultId`/`definitionVersion`), `libraryVersion`, `disclaimerVersion`, attempt `status` (`PENDING`/`GENERATING`/`READY`/`FAILED`), `validationOutcome` (sanitized), `retryCount`, `tokenUsage`, `latencyMs`, `started_at`, `deadline_at` (lease expiry for that attempt), `finished_at`, and a sanitized `errorCode`. A retry creates a **new** row and does not mutate prior attempt rows (the prior `FAILED` attempt row is retained for audit). **No chain-of-thought, no raw content, no plan copy** is persisted — only references and operational metadata.
- **Parent plan lease metadata**: `CoachingPlan` carries `generationStartedAt` + `generationDeadlineAt` (the configured lease for the in-flight attempt) and a `currentAttemptId` reference to the in-flight `CoachingPlanGeneration` row, used to discard late results from expired attempts. An attempt is stale once `now() > generationDeadlineAt`.
- **Provider data policy**: the context passed to the provider is bounded to the grounding bundle (no raw assessment answers / free-text / safety). The provider's data-retention / training policy MUST be reviewed before production use.

---

## Behavior notes

- **One current plan per user** (FR-008; spec §7 PlanVersion; research D7): exactly one plan per user is `isCurrent=true`, DB-enforced by a partial unique index `ON "CoachingPlan"("userId") WHERE "isCurrent" = true`. The current plan may be in **any** `generationStatus`, including `PENDING`/`GENERATING`/`FAILED` (with `planStatus = null`). Only `generationStatus = READY` plans are returned with a body by `GET`; `PENDING`/`GENERATING` return `202` (poll); `FAILED` returns `503` + retry. The partial unique index still enforces one current plan. **Only the `isCurrent=true` plan is returned by `GET` / `POST` / `POST /accept` / mutable via `PATCH`**; historical (`isCurrent=false`) plans are never exposed by any endpoint. A superseded plan keeps its final `generationStatus`/`planStatus` as a frozen immutable snapshot — it is **not** relabeled. There is **no `SUPERSEDED` status**.
- **Source pinning** (FR-009/FR-011; research D7): each plan pins `sourceAssessmentId`/`sourceResultId`/`definitionVersion`/`libraryVersion`/`disclaimerVersion`/`promptVersion`/`planVersion`, immutable after creation. A future assessment retake (new `resultId`) produces a **new** plan row; the old row is retained, immutable (no silent overwrite). `isCurrent` flags the active one. The `source` object exposed in responses includes `disclaimer_version` and `prompt_version`. Regeneration is user-initiated and a defined future boundary — not built this feature (A9).
- **Reproducibility + grounding** (FR-006/AC-X3): deterministic components (eligibility, grounding-bundle assembly, validation, lifecycle, idempotency, concurrency) are reproducible. LLM output is non-deterministic but **validated and grounded**: allowed library ids are enforced (every `libraryKey` must exist in the pinned library version), and safety/scope checks reject unsupported content. Automated tests use fakes — never live paid providers.
- **No invented clinical content** (FR-010/FR-010a; Constitution I/III): enforced by (a) grounding — library-constrained ids so the LLM cannot reference non-existent goals/actions, and (b) deterministic safety validation in `coaching-plan-validator.ts` — scope / clinical / diagnostic / medication / crisis / concerning-output detection → reject → `generationStatus = FAILED` (`planStatus` stays `null`), no usable plan persisted. The LLM is instructed not to invent such content; validation backstops the instruction.
- **Explicit acceptance** (Constitution IV; FR-006d/FR-027a): an AI-generated plan has `generationStatus = READY` and `planStatus = PROPOSED`; `planStatus` becomes `ACTIVE` only via `POST /coaching/plan/accept` (which transitions **only** `planStatus: PROPOSED → ACTIVE` and does **not** change `generationStatus`), allowed only when `generationStatus = READY` and `planStatus = PROPOSED`. Acceptance of an already-`ACTIVE`/`COMPLETED` plan is an idempotent no-op success; acceptance while `generationStatus ∈ {PENDING, GENERATING}` → `409 PLAN_NOT_READY`; acceptance of a `generationStatus = FAILED` plan → `409 PLAN_UNAVAILABLE`; acceptance is blocked (`409 SAFETY_HOLD`) if the user has entered `SAFETY_HOLD` after generation. `PATCH /coaching/plan/actions/{action_id}` is permitted only when `generationStatus = READY` and `planStatus ∈ {ACTIVE, COMPLETED}`.
- **Generation lifecycle (two independent statuses)** (FR-006c/FR-008/FR-012): `generationStatus: PENDING → GENERATING → READY` (success, atomically setting `planStatus → PROPOSED`) or `→ FAILED` (provider failure, malformed output, validation failure, missing grounding, or concerning output); `planStatus: PROPOSED → ACTIVE` (accept; touches only `planStatus`); `planStatus: ACTIVE ⇄ COMPLETED` (auto via PATCH; touches only `planStatus`). `FAILED` is a GenerationStatus, never a PlanStatus; a `FAILED` plan has `planStatus = null` and persists no usable plan content. Generation is async start + poll, in-process with DB-tracked status, no new infra. Idempotency: no duplicate plans and no duplicate provider calls for an in-flight or already-produced plan. A UI locale change transitions neither status and never invokes generation. Retry / timeout are bounded by config.
- **Async execution safety (lease + reclaim; no fire-and-forget)** (A18/FR-006f): the MVP keeps async start + poll without Redis or a job queue, but generation MUST NOT rely on an untracked fire-and-forget Promise after the HTTP response. **Atomic generation claim**: the `PENDING → GENERATING` transition is a single conditional update (`WHERE generationStatus='PENDING'`); only one worker/request succeeds, so simultaneous retries/claims never start duplicate provider calls. **Tracked in-process runner**: a singleton generation runner (Coaching-owned) holds a registry of in-flight attempts by `planId`/`currentAttemptId` with AbortSignals — observable and cancelable, not an untracked Promise; triggered by `POST` (start) and by `GET`/`POST` reclaim. **Lease metadata**: each in-flight attempt has `generationStartedAt` + `generationDeadlineAt` (configured lease); stale once `now() > generationDeadlineAt`; `currentAttemptId` references the in-flight `CoachingPlanGeneration` row. **Stale recovery** (incl. process restart): on `GET`/`POST`, if `generationStatus='GENERATING'` AND `now() > generationDeadlineAt` → reclaim (stale attempt `FAILED` with `TIMEOUT`/`STALE`, `generationStatus → PENDING`); in-flight tracked promises lost on restart are recovered lazily on the next `GET`/`POST` after the deadline. **Retry**: a `POST` while `generationStatus = FAILED` (or a reclaim) transitions `generationStatus: FAILED → PENDING` on the **same current plan record** and creates a **new** `CoachingPlanGeneration` attempt row; the worker then claims it. No new `CoachingPlan` row is created for a retry. **Late-result guard**: a worker persists only via a conditional update guarded on `generationStatus='GENERATING' AND currentAttemptId=:thisAttemptId`; if a newer attempt was claimed (or the plan is already `READY`), `currentAttemptId` no longer matches → 0 rows → the late result is **discarded**; a late success from an expired attempt can never overwrite a newer successful attempt. **Provider timeout**: handled per adapter config; on timeout the attempt transitions `generationStatus → FAILED` (reclaimable) and a retry creates a new attempt. **Duplicate POST**: returns the same plan and never duplicates an active provider call — if `generationStatus` is `GENERATING` (lease alive), `POST` returns `202` and starts nothing; if `READY`, returns the resource without a provider call; if `PENDING`, the atomic claim ensures at most one call. **Runtime prerequisite**: this in-process model requires the API process to be a **long-running containerized NestJS service** (the deployment per plan.md) so the tracked runner survives between the `202` response and attempt completion; if the deployment were serverless or scaled the API process to zero between requests, the execution-trigger mechanism would be NEEDS CLARIFICATION (it would require a real queue) — not a blocker under the current deployment.
- **Pre/post-generation safety** (Constitution II; §8): pre-generation — eligibility + safety gate means `SAFETY_HOLD` / `HIGH_RISK` / `CRISIS` users never enter generation (`409 SAFETY_HOLD`). Post-generation — deterministic safety validation (scope / clinical / medication / crisis / concerning-output detection) rejects unsafe output → `generationStatus = FAILED` (`planStatus` stays `null`), no usable plan persisted.
- **No raw assessment/safety data in responses** (FR-017/A10): the `source` object exposes only `assessment_id`/`result_id`/`definition_version`/`library_version`/`disclaimer_version`/`prompt_version`; no domain scores, answers, free text, or safety levels. The grounding bundle passes assessment **evidence** (codes/bands/priorities) to the provider, never raw answers/free-text/safety.
- **Ownership** (FR-031/FR-032, US5): `userId` from `req.user.sub` only; `GET` and `POST` have no plan-id param (resolved server-side); `PATCH` validates `action_id` via the `plan.userId` join; cross-user → `404` (no leak). Re-checked against `isCurrent` on every call.
- **Concurrent updates converge** (FR-030/FR-033; AC-X5): same-status is a no-op; different-status uses conditional `updateMany` + `version`; stale `expected_version` → `409 ACTION_CONFLICT` (refetch). No lost update, no double-count.
- **Automatic lifecycle after acceptance** (FR-022a/FR-022b; AC-X9): `planStatus` is only written by `recomputePlanStatus` inside the PATCH transaction (after the plan is `ACTIVE`); there is no separate "mark plan complete" control. Only `ACTIVE ⇄ COMPLETED` ever results from a PATCH (touches only `planStatus`, never `generationStatus`). Reopening any action returns the plan to `ACTIVE`.
- **Transactional creation** (FR-029): on success, `generationStatus → READY` and `planStatus → PROPOSED` are set atomically in one `prisma.$transaction` together with `CoachingPlan` content + `FocusArea` + `Goal` + `ActionStep`, or nothing (partial/failed creation leaves no orphan rows — spec §6 partial-failure edge case). On `FAILED`, no usable plan content is persisted (only the `CoachingPlan` row at `generationStatus = FAILED` + the `CoachingPlanGeneration` audit row). A retry re-attempts cleanly on the same row via a new attempt.
- **No sensitive telemetry** (FR-039/SC-010): plan/progress content and provider raw output are excluded from logs/analytics/traces/error reports; only sanitized counters (e.g. `plan_id`, `completed`/`total`, bounded `CoachingPlanGeneration` metadata) are logged via `toSafeLogContext`. No `safety_level` is ever logged.
- **Cross-module read** (research D2): Coaching reads the scored result via the exported `AssessmentResultService.getScoredResult(userId)` on `AssessmentModule`; it does not touch assessment tables directly (SAD §5 / ADR-005). Onboarding/safety are read via `OnboardingGuardService` / `SafetyService`.

---

## Retention & deletion

- **Account deletion** (`DELETE /me/account`, FR-040, Constitution VI): the Coaching module exposes `COACHING_DELETION_PORT` (`CoachingDeletionPort { deleteExpired(cutoffs); deleteCoachingForUsers(userIds) }` returning `DeletionCategoryCounters`), bound with `useExisting` and exported from `CoachingModule`. `AccountDeletionService` injects it and deletes coaching rows in referential order — **after `assessment` (coaching depends on the result) and before `safety`/`profile`/`account`** (cascade-safe: coaching references only `UserAccount`). `deleteCoachingForUsers(userIds)` = `coachingPlan.deleteMany({ where: { userId: { in: userIds } } })` — cascades `FocusArea`/`Goal`/`ActionStep`/`CoachingPlanGeneration` via schema `onDelete: Cascade`. Idempotent, counted, no content logged. The platform `DeletionLog.categoryCounts` gains a `coaching` entry `{ deleted, errors }` (integers only — FR-039/SC-010).
- **Scheduled retention** (research D10): `RetentionModule` imports `CoachingModule`; `RetentionService` injects `COACHING_DELETION_PORT` and adds a `coaching` category to `scheduledCutoffs`/`runScheduledCategories`/`CategoryCounts`. `deleteExpired(cutoffs)` is an MVP **no-op / forward-compat hook**: completed plans are retained while the account exists (mirrors feature-001 completed-result retention, Consent §8). The cutoff shape is defined for forward-compat only; no premature deletion logic (Constitution XII).