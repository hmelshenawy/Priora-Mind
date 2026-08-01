# Data Model — 002-coaching-plan

**Phase**: 1 (Design & Contracts)
**Date**: 2026-08-01
**Storage**: PostgreSQL via Prisma (feature-001 research D1). One owner per entity per SAD §5 / ADR-005; the Coaching module owns every entity below (the new `ai` module implements the LLM adapter and prompt templates but owns **no** persisted entity — it is a port adapter for Coaching).
**Convention**: `id` = UUID v4 (or cuid); all timestamps UTC `timestamptz`. Every user-owned row carries `userId` and is isolated by backend authorization (the userId always comes from `req.user.sub`, never from the body/params — FR-031/FR-032). Plan/progress content is **never** selected into logs/traces (FR-039; feature-001 research D7). Bilingual content is stored as `Json` `{en, ar}` (mirrors feature-001 `Bilingual`).

Stable product entities are defined in spec §7 (Key Entities); this document defines their persisted shape, validation, state machines, indexes, and migrations. It adds **no** columns to feature-001 tables except a back-relation on `UserAccount` (Coaching never writes to feature-001 tables; it reads `AssessmentResult` via the exported `AssessmentResultService` — research D2).

**Architecture reversal (this feature)**: the coaching plan is now produced by a **hybrid deterministic + LLM** pipeline. Deterministic code assembles a grounding bundle (assessment evidence + profile + active library + disclaimer + prompt), an LLM (via `COACHING_LLM_PORT`) returns a strict structured `LlmPlanOutput`, and a deterministic validator checks schema, allowed library ids, limits, safety, traceability, and bilingual completeness before a plan becomes usable. No chain-of-thought, no raw assessment content, and no plan copy are ever persisted on the generation audit row — only references and operational metadata.

---

## Entity ownership summary

| Entity | Owner module | Source |
|---|---|---|
| CoachingPlan | Coaching | spec §7; SAD §5 (ADR-007) |
| FocusArea | Coaching | spec §7 |
| Goal | Coaching | spec §7 |
| ActionStep | Coaching | spec §7 (fulfills SAD "Exercise" role) |
| CoachingPlanGeneration | Coaching | this document (hybrid LLM pipeline — audit/operational metadata) |
| CoachingActionLibrary (reference) | Coaching | spec §7; research D4 |
| CoachingDisclaimer (reference) | Coaching | spec §7; research D4 |
| `AssessmentResult` (consumed read-only) | Assessment | feature 001 (read via `AssessmentResultService`, research D2) |
| `OnboardingState` / `SafetyEvaluation` (consumed read-only) | Profile / Safety | feature 001 (read via `OnboardingGuardService` / `SafetyService`) |

Reference/definition rows are versioned, immutable content (research D4), not user-owned. The Coaching module adds no platform operational table; deletion counters are recorded in the existing feature-001 `DeletionLog` (extended with a `coaching` category — research D10). The new `ai` module owns no entity — it implements the `COACHING_LLM_PORT` adapter and the prompt templates, and is consumed by Coaching.

**PlanVersion reconciliation**: the spec lists `PlanVersion` as a §7 Key Entity ("an immutable historical version of a plan ... only one version is current/active per user at a time"). It is modeled here as the `planVersion` + `isCurrent` **columns on `CoachingPlan`** (research D7), **not** a separate Prisma model. The persisted model count is therefore **7** (4 user-owned + 1 generation-audit + 2 versioned reference), not 8.

---

## 1. CoachingPlan (Coaching)

A user's personalized, non-clinical plan. One current plan per user per source result. The plan is created with `generationStatus = PENDING` and `planStatus = null`; it has no usable lifecycle/content until `generationStatus = READY` (which atomically sets `planStatus = PROPOSED`); it becomes actionable only after the user explicitly accepts the `PROPOSED` plan (`PROPOSED → ACTIVE`).

Generation tracks **two independent concepts** modeled as two separate enums (spec §1, A14/A18, FR-006c):
- **`generationStatus`** (`CoachingGenerationStatus`: `PENDING | GENERATING | READY | FAILED`) — the progress of the current generation attempt; a column on `CoachingPlan` **and** on each `CoachingPlanGeneration` attempt row.
- **`planStatus`** (`CoachingPlanStatus`: `PROPOSED | ACTIVE | COMPLETED`) — the plan lifecycle; a **nullable** column on `CoachingPlan` (null until `generationStatus = READY`). (The CoachingPlan lifecycle column is named `planStatus`, not `status`, to distinguish it from `ActionStep.status` and `CoachingPlanGeneration.status`. Note: spec §7 Key Entities refers to this concept as both `planStatus` and `status`; the persisted column name is `planStatus`.)

| Field | Type | Notes / validation |
|---|---|---|
| id | uuid pk | |
| userId | uuid fk → UserAccount | `onDelete: Cascade`; isolation key (FR-032) |
| sourceAssessmentId | string | pinned source assessment (FR-009); loose ref (no FK to assessment table — Coaching must not reach across module boundaries) |
| sourceResultId | string | pinned source `AssessmentResult` (FR-009); loose ref |
| definitionVersion | string | pinned assessment definition version (FR-009) |
| libraryVersion | string | pinned `CoachingActionLibrary` version (FR-009; research D4) — also grounds/constrains allowed library ids at validation |
| disclaimerVersion | string | pinned `CoachingDisclaimer` version (FR-016) |
| planVersion | int, default 1 | increments only on a future user-initiated regenerate (research D7) |
| isCurrent | boolean, default true | only one current plan per user (FR-026; research D7). A `generationStatus = FAILED` row keeps `isCurrent=true` so GET shows failed/unavailable and retry targets the same row; a successful retry transitions the **same row** `generationStatus: FAILED → PENDING → … → READY` and sets `planStatus = PROPOSED` (no new row). |
| planStatus | enum `CoachingPlanStatus`, **nullable**, default null | plan lifecycle (`PROPOSED` \| `ACTIVE` \| `COMPLETED`); **null until `generationStatus = READY`** (a plan has no usable lifecycle/content before a successful validated generation). Set to `PROPOSED` atomically with `generationStatus → READY`; `PROPOSED → ACTIVE` only via explicit acceptance; `ACTIVE ⇄ COMPLETED` auto-driven by action progress after acceptance. **Never** holds `PENDING`/`GENERATING`/`FAILED` (those are `GenerationStatus` values, on `generationStatus`). Named `planStatus` (not `status`) to distinguish it from `ActionStep.status` and `CoachingPlanGeneration.status`. |
| generationStatus | enum `CoachingGenerationStatus`, default `PENDING` | progress of the current generation attempt (`PENDING` \| `GENERATING` \| `READY` \| `FAILED`). Default `PENDING` on creation. The atomic claim transitions `PENDING → GENERATING`; successful validation transitions `GENERATING → READY` (atomically with `planStatus → PROPOSED`); provider/validation failure or a stale-reclaim transitions to `FAILED`; retry transitions `FAILED → PENDING` on the **same** row. |
| generationStartedAt | timestamptz, nullable | lease start for the in-flight attempt (set on the `PENDING → GENERATING` atomic claim, alongside `generationDeadlineAt` and `currentAttemptId`); null while `PENDING`/`READY`/`FAILED`. |
| generationDeadlineAt | timestamptz, nullable | lease expiry (`generationStartedAt + lease`, config-driven — §15). The attempt is **stale** once `now() > generationDeadlineAt`; the next `GET`/`POST` reclaims it (stale attempt `FAILED` with `TIMEOUT`/`STALE`, `generationStatus → PENDING`). |
| currentAttemptId | uuid, nullable | loose reference to the in-flight `CoachingPlanGeneration.id` (no FK — the attempt row is the child; this is a loose pointer used by the **late-result guard**: persistting an attempt's result is a conditional update guarded on `generationStatus = 'GENERATING' AND currentAttemptId = :thisAttemptId`; a newer attempt → 0 rows → late result discarded). Nullable; null while `PENDING`/`READY`/`FAILED`. |
| title | jsonb `Bilingual` | LLM-generated bilingual title (validated against `LlmPlanOutput`); immutable after creation |
| summary | jsonb `Bilingual` | LLM-generated short current-focus summary; immutable after creation |
| disclaimer | jsonb `Bilingual` | pinned `CoachingDisclaimer` version's copy (validator ensures it matches the pinned version); immutable after creation |
| createdAt | timestamptz | `@default(now)` |
| updatedAt | timestamptz | `@default(now)`; bumped on lifecycle transition (acceptance, auto lifecycle recompute — FR-022b) and on `generationStatus` transitions |

**Constraints / indexes**:
- `@@unique([userId, sourceResultId])` — idempotent get-or-create per source result (FR-008; research D5) **and** source-pinning for retakes (FR-009/FR-011; research D7). A new `resultId` → a new row; the old row stays immutable. Also guards generation idempotency: a repeated `POST /coaching/plan` for a current plan whose `generationStatus` is not `FAILED` returns it without a duplicate provider call.
- `@@index([userId, isCurrent])` — fast "current plan" lookup.
- `@@index([userId])`.
- `@@index([currentAttemptId])` — supports the late-result guard's lookup of the in-flight attempt (A18/FR-006f).
- **Partial unique index** (raw SQL in the migration — Prisma `@@unique` cannot express a `WHERE` filter): `CREATE UNIQUE INDEX "coaching_plan_current_one_per_user" ON "CoachingPlan"("userId") WHERE "isCurrent" = true;` — enforces **exactly one current plan per user** at the DB level (research D7; spec §7 PlanVersion "only one current/active per user at a time"). This deliberately strengthens feature-001's `SafetyEvaluation` precedent (which uses only `@@index([userId, isCurrent])` + an app-level flip) because the spec's one-current invariant and FR-011 (no silent overwrite) require a hard guarantee against two currents coexisting.

**State machine** — two independent statuses on `CoachingPlan`:

`generationStatus` (CoachingGenerationStatus — one generation attempt's progress):
```
[creation]                       → PENDING        (row inserted; planStatus=null; currentAttemptId=null)
PENDING   --atomic claim------->  GENERATING      (conditional UPDATE WHERE generationStatus='PENDING'; sets generationStartedAt, generationDeadlineAt, currentAttemptId; only one worker/request succeeds)
GENERATING --success (atomic)->  READY           (validation passed; in ONE transaction set generationStatus=READY AND planStatus=PROPOSED; persist plan content + sub-entities)
GENERATING --failure---------->  FAILED          (provider/validation failure, or stale reclaim: no usable plan content persisted; planStatus stays null)
GENERATING --stale reclaim---->  FAILED          (now() > generationDeadlineAt on GET/POST: stale CoachingPlanGeneration row FAILED TIMEOUT/STALE; generationStatus → PENDING)
FAILED    --retry (same row)--->  PENDING         (POST while FAILED: generationStatus FAILED→PENDING on the SAME CoachingPlan row + NEW CoachingPlanGeneration attempt row; planStatus stays null)
```

`planStatus` (CoachingPlanStatus — plan lifecycle; nullable until `generationStatus = READY`):
```
(null)         --gen READY----->  PROPOSED        (atomic with generationStatus→READY; awaiting explicit user accept)
PROPOSED       --POST /accept->  ACTIVE          (explicit acceptance; touches ONLY planStatus, never generationStatus)
ACTIVE         --all COMPLETE->  COMPLETED       (auto lifecycle recompute on PATCH; touches ONLY planStatus)
COMPLETED      --any INCOMPLETE-> ACTIVE          (auto lifecycle recompute on PATCH; touches ONLY planStatus)
```

The plan is created `generationStatus = PENDING`, `planStatus = null` (not `ACTIVE`). Generation is async (POST returns `202` while `generationStatus` is `PENDING`/`GENERATING`); clients poll `GET /coaching/plan`, which returns `generationStatus` during generation and `planStatus` + usable content when `generationStatus = READY`. A plan has no usable lifecycle/content until `generationStatus = READY`; successful validated generation transitions `generationStatus → READY` and `planStatus → PROPOSED` **atomically** (one transaction, FR-006c/FR-029). `PROPOSED` means generation succeeded and the plan is validated and ready, **awaiting explicit user acceptance**; `ACTIVE` is reached **only** via `POST /coaching/plan/accept` (which touches **only** `planStatus`, never `generationStatus` — FR-006d). `ACTIVE ⇄ COMPLETED` is the auto lifecycle after acceptance, recomputed inside the PATCH transaction and touching **only** `planStatus` (FR-022a/FR-022b, research D9). `FAILED` is a `CoachingGenerationStatus` value (held on `generationStatus`), **never** a `CoachingPlanStatus` value (never held on `planStatus`); on failure `planStatus` stays null and no usable plan content is persisted. A retry re-attempts generation on the **same** `CoachingPlan` row (`generationStatus: FAILED → PENDING`) and appends a **new** `CoachingPlanGeneration` row — no new `CoachingPlan` row is created for a retry on the same `sourceResultId`. There is **no `SUPERSEDED` status** (the approved spec does not require it; research D7).

**PATCH scope**: `PATCH .../actions/:action_id` is allowed **only** when `generationStatus = READY` **and** `planStatus` is `ACTIVE` or `COMPLETED` (action toggling is meaningless before acceptance). `PATCH` while `generationStatus ≠ READY` → `409 PLAN_NOT_READY`; `PATCH` while `generationStatus = READY` but `planStatus = PROPOSED` → `409 PLAN_NOT_ACTIVE` (FR-028/FR-034).

**Authoritative "current plan" behavior (research D7)**: exactly one plan per user is `isCurrent=true`; all historical plans are `isCurrent=false`. A superseded historical plan is **not relabeled** — it keeps its final `planStatus` and `generationStatus` as a **frozen immutable snapshot** of where it was when superseded; that frozen `planStatus` is **not** a live "active" indicator and cannot create ambiguity, because only the `isCurrent=true` plan is returned by `GET /coaching/plan` and mutable via `PATCH` (contracts/coaching-plan.md). `GET /coaching/plan` returns `generationStatus` while `PENDING`/`GENERATING`; when `generationStatus = READY` it returns `planStatus` + usable plan content (for `PROPOSED`/`ACTIVE`/`COMPLETED`); on `generationStatus = FAILED` it returns the safe retryable failure representation with `503 PLAN_UNAVAILABLE` (no usable plan content). There is no `GET /coaching/plan/:id` (JWT-only ownership — FR-031/FR-032). A `generationStatus = FAILED` current plan remains `isCurrent=true` precisely so GET surfaces the failed/unavailable state and so retry targets the same row; on a successful retry the same row transitions `generationStatus: FAILED → PENDING → … → READY` and `planStatus` becomes `PROPOSED`, then continues to acceptance — no new current row is inserted for the same `sourceResultId`. A future user-initiated regenerate (retake) MUST, in one transaction, (a) flip the prior plan `isCurrent=false` (frozen `planStatus`/`generationStatus` untouched), then (b) insert the new plan `isCurrent=true`; the partial unique index forces this order and prevents two currents. Regeneration is future and user-initiated only (FR-011) — not built this feature. For MVP, the single plan is `isCurrent=true, planVersion=1`.

**Immutability**: a plan's source pins (`sourceAssessmentId`, `sourceResultId`, `definitionVersion`, `libraryVersion`, `disclaimerVersion`, `planVersion`) and its content (`title`, `summary`, `disclaimer` — now LLM-generated for title/summary, pinned-version copy for disclaimer) are immutable after creation (FR-009/FR-011; research D7). Only `planStatus` (acceptance + auto lifecycle recompute — research D9), `generationStatus` (generation attempt progress), the lease metadata (`generationStartedAt`/`generationDeadlineAt`), `currentAttemptId`, `updatedAt`, and `isCurrent` (the supersede flip) may change.

**Suppression**: no `CoachingPlan` is served while `OnboardingState = SAFETY_HOLD` (FR-004; spec §8). The eligibility gate re-checks `SafetyService.currentLevel` on every request.

---

## 2. FocusArea (Coaching)

A coaching theme derived from a domain (a domain the user will focus on). Deduplicated, capped at three (A6/FR-014). Now produced by the LLM within `LlmPlanOutput` (domain, source, reason) and validated by the deterministic validator.

| Field | Type | Notes / validation |
|---|---|---|
| id | uuid pk | |
| planId | uuid fk → CoachingPlan | `onDelete: Cascade` |
| domain | string | `DomainCode` the focus area targets (`stress`/`mood`/`energy`/`sleep`/`focus`/`confidence`/`relationships`/`balance`) |
| source | string | `'priority'` \| `'support'` \| `'lowest_band'` — why it was selected (A6) |
| position | int | ordered position (1-based) |
| reason | jsonb `Bilingual` | user-friendly non-clinical reason (LLM-generated within `LlmPlanOutput`, validated bilingual non-empty) |

**Constraints / indexes**: `@@index([planId])`. No unique on `domain` (dedup + cap-at-3 enforced by the validator/generator, not the DB — research D3). Cascade-deleted with the plan.

---

## 3. Goal (Coaching)

A prioritized coaching goal within a focus area.

| Field | Type | Notes / validation |
|---|---|---|
| id | uuid pk | |
| planId | uuid fk → CoachingPlan | `onDelete: Cascade` |
| focusAreaId | uuid fk → FocusArea | `onDelete: Cascade` |
| position | int | ordered |
| copy | jsonb `Bilingual` | approved goal copy from the library (LLM selects; validator ensures copy matches the pinned library version entry for `libraryKey`) |
| libraryKey | string | stable library entry key (audit/version pin — research D4); validator rejects keys not present in the pinned `libraryVersion` |

**Constraints / indexes**: `@@index([planId])`, `@@index([focusAreaId])`. Cascade-deleted with the plan/focus area.

---

## 4. ActionStep (Coaching)

A small, practical action the user can take — the trackable unit (fulfills the SAD "Exercise" role for this feature). One row per action per plan. Now produced by the LLM within `LlmPlanOutput` (libraryKey, position, pacingLabel, copy) and validated by the deterministic validator.

| Field | Type | Notes / validation |
|---|---|---|
| id | uuid pk | the `action_id` used by `PATCH` (FR-028) |
| planId | uuid fk → CoachingPlan | `onDelete: Cascade` |
| focusAreaId | uuid fk → FocusArea | `onDelete: Cascade` |
| goalId | uuid fk → Goal, nullable | `onDelete: Cascade`; nullable to tolerate library actions not bound to a goal |
| position | int | suggested order within the focus area (A8) |
| pacingLabel | jsonb `Bilingual`, nullable | optional pacing label ("start here"/"next"/"when ready") from the library (A8) |
| copy | jsonb `Bilingual` | approved action copy from the library (validator ensures copy matches the pinned library version entry for `libraryKey`) |
| libraryKey | string | stable library key (audit pin); validator rejects keys not present in the pinned `libraryVersion` |
| status | enum `ActionStatus`, default `INCOMPLETE` | per-action completion (FR-015/FR-020) |
| updatedAt | timestamptz | bumped on PATCH (concurrency sentinel — research D8) |
| version | int, default 1 | optimistic-concurrency counter (FR-033; research D8) |

**Constraints / indexes**: `@@index([planId])`, `@@index([focusAreaId])`. Cascade-deleted with the plan.

**Concurrency** (research D8): `version` provides optimistic concurrency; the conditional `updateMany` `where.status.in` guard (on `ActionStep.status`) makes a same-status update a no-op at the DB level (FR-030). Both are used together (see contracts/coaching-plan.md). PATCH is permitted only while `generationStatus = READY` and the plan's `planStatus` is `ACTIVE`/`COMPLETED`.

---

## 5. CoachingActionLibrary (Coaching — versioned reference)

The approved, bilingual, versioned library of focus-area reasons, goals, and action steps (A7/FR-010a). Required implementation input and launch gate (spec §16). One row per published version. **Now grounds and constrains generation**: the pinned library version (looked up by the **exact required `libraryVersion`** and integrity-verified against the authoritative `COACHING_LIBRARY_V1` constant) is supplied to the LLM in the grounding bundle, and the deterministic validator **rejects any `libraryKey` in `LlmPlanOutput` that is not present in the pinned `libraryVersion`** — the library is no longer a client-side pick-list; it is the ground truth the LLM is bound to and that the validator enforces. There is **no `isActive`/active-flag column** — selection is by exact version lookup + integrity verification, not by an active/approved database flag.

| Field | Type | Notes |
|---|---|---|
| id | uuid pk | |
| version | string, `@unique` | e.g. "1.0" — the exact-version lookup key |
| content | jsonb `CoachingLibraryContent` | full bilingual library (per-domain focus-area reasons, goals, ordered actions, pacing labels, title/summary templates — research D3/D4) |
| publishedAt | timestamptz | `@default(now)` |

**Constraints**: `version @unique`. Immutable once published; new versions are new rows (research D4). **Single authoritative source**: the `content` JSON is a persisted, immutable **snapshot** of the single typed `COACHING_LIBRARY_V1` constant defined in `src/modules/coaching/coaching-library.ts` (research D4) — the seed imports that constant and **creates the row if the version does not exist**; if the version already exists it **verifies the stored content + integrity representation against the constant**, succeeding unchanged when identical and **failing loudly on any difference** (it never updates or overwrites an existing version); it does **not** redefine the content. The grounding service reads the same constant at runtime. No duplicate independent copy of the approved bilingual content is maintained. Final clinical sign-off (T001) is the content-approval gate (spec §16).

---

## 6. CoachingDisclaimer (Coaching — versioned reference)

The approved-scope disclaimer, bilingual, versioned (mirrors feature-001 `SafetyCopy`). One row per version. **Now grounds generation**: the pinned version's disclaimer copy is supplied to the LLM in the grounding bundle, and the plan's `disclaimer` field is the pinned version's copy; the validator ensures the plan's `disclaimer` matches the pinned `disclaimerVersion`.

| Field | Type | Notes |
|---|---|---|
| id | uuid pk | |
| version | string | |
| copyEn | string | English disclaimer (FR-016) |
| copyAr | string | Arabic disclaimer (FR-016) |
| publishedAt | timestamptz | |

**Constraints**: `@@unique([version])`. Immutable once published. **Single authoritative source**: `copyEn`/`copyAr` are a persisted snapshot of the single `COACHING_DISCLAIMER_V1` constant (research D4); the seed imports it and **creates the row if the version does not exist** — if it exists, it **verifies the stored content + integrity representation against the constant**, succeeding unchanged when identical and **failing loudly on any difference** (never updating or overwriting an existing version). The grounding service reads the same constant. No duplicate independent copy. Final legal/privacy sign-off (T001) is the content-approval gate (spec §16).

---

## 7. CoachingPlanGeneration (Coaching — generation audit / operational metadata)

One row per generation **attempt** for a plan. Operational/audit metadata only — **NO chain-of-thought, NO raw assessment content, NO plan copy** are persisted here. A retry appends a new row (with the next `attempt` index) for the same `planId`; `retryCount` on the row reflects the attempt index. Owned by Coaching.

| Field | Type | Notes / validation |
|---|---|---|
| id | uuid pk | |
| planId | uuid fk → CoachingPlan | `onDelete: Cascade` — deleted with the plan |
| attempt | int | increments per attempt per plan (1-based) |
| provider | string | LLM provider identifier (config-driven, e.g. "openai" / "fake") |
| modelId | string | model identifier used for this attempt |
| promptVersion | string | pinned prompt-template version (managed by the `ai` module) |
| sourceAssessmentId | string | loose ref to the pinned source assessment (mirrors the plan pin) |
| sourceResultId | string | loose ref to the pinned source result (mirrors the plan pin) |
| definitionVersion | string | pinned assessment definition version (mirrors the plan pin) |
| libraryVersion | string | pinned `CoachingActionLibrary` version used to ground/constrain this attempt |
| disclaimerVersion | string | pinned `CoachingDisclaimer` version used in this attempt |
| status | enum `CoachingGenerationStatus`, default `PENDING` | per-attempt generation lifecycle (`PENDING` \| `GENERATING` \| `READY` \| `FAILED`). Independent of the parent plan's `CoachingPlan.planStatus` (lifecycle) and of `ActionStep.status`; mirrors `CoachingPlan.generationStatus` for the attempt in flight. This attempt-row column is named `status` (matching the existing audit-row convention); the parent plan's lifecycle column is `planStatus`. |
| validationOutcome | jsonb | `{ result: 'VALID' \| 'INVALID', reasons: string[] }` — sanitized reasons only; NO raw LLM content, NO plan copy |
| retryCount | int | attempt index for this row (1 = first attempt) |
| tokenUsage | jsonb, nullable | `{ prompt, completion, total }` token counts or null |
| latencyMs | int, nullable | end-to-end generation latency in ms or null |
| startedAt | timestamptz | when the attempt started (set on the `PENDING → GENERATING` atomic claim; mirrors the parent plan's `generationStartedAt` for this attempt) |
| deadlineAt | timestamptz, nullable | **lease expiry for this attempt** (`startedAt + lease`, config-driven — §15). The attempt is stale once `now() > deadlineAt`; the next `GET`/`POST` reclaims it (marks this row `FAILED` with `TIMEOUT`/`STALE`, transitions the parent `CoachingPlan.generationStatus → PENDING`). Mirrors the parent plan's `generationDeadlineAt`. Null before the claim. |
| finishedAt | timestamptz, nullable | when the attempt finished (success or failure); null while in flight. Persisted only via the conditional late-result-guard update (`generationStatus='GENERATING' AND currentAttemptId=:thisAttemptId`). |
| errorCode | string, nullable | sanitized error code on `FAILED` (e.g. `TIMEOUT`, `STALE`, `PROVIDER_ERROR`, `VALIDATION_FAILED`, `CONCERNING_OUTPUT` — no content / no CoT). |

**Constraints / indexes**:
- `@@index([planId])` — per-plan history lookup.
- `@@index([planId, attempt])` — ordered per-plan attempt history.
- `planId` FK `onDelete: Cascade` — generation rows are deleted with the plan (and thus by `COACHING_DELETION_PORT`).

**Data-minimization guarantees**: this row stores references (ids/versions) and operational metadata (provider, model, timings, tokens, sanitized error codes, sanitized validation reasons) only. It does **not** store: the LLM prompt, the LLM chain-of-thought, raw assessment answers/scores/free-text/safety data, or any copy of the generated plan content. The grounding bundle and `LlmPlanOutput` are in-memory only within a generation attempt; only the validated, user-facing plan content is persisted on `CoachingPlan`/`FocusArea`/`Goal`/`ActionStep`.

**Lifecycle** (one row per attempt; prior rows are immutable): `PENDING` (row created when the attempt is claimed on the parent plan) → `GENERATING` (provider called; `startedAt`/`deadlineAt` set by the atomic claim) → `READY` (validation passed; the parent `CoachingPlan` transitions `generationStatus → READY` **and** `planStatus → PROPOSED` **atomically**) or `FAILED` (provider/validation failure, concerning output, or stale reclaim; the parent `CoachingPlan.generationStatus` transitions to `FAILED`, `planStatus` stays null). A retry inserts a **new** `CoachingPlanGeneration` row with `attempt = prev + 1` and transitions the **same** `CoachingPlan` row `generationStatus: FAILED → PENDING → …` (the parent plan's `planStatus` stays null throughout the retry until a successful `READY` claim). A stale `GENERATING` attempt (now() > `deadlineAt`, incl. one orphaned by a process restart) is reclaimed on the next `GET`/`POST`: this row is marked `FAILED` with `TIMEOUT`/`STALE` and the parent `CoachingPlan.generationStatus` returns to `PENDING`. The persist of an attempt's result (success or failure) is a conditional update guarded on `CoachingPlan.generationStatus = 'GENERATING' AND currentAttemptId = :thisAttemptId` (the **late-result guard**): a newer attempt's claim means `currentAttemptId` no longer matches → 0 rows → the late result is discarded and can never overwrite a newer successful attempt (A18/FR-006f).

**LLM provider port**: Coaching owns the `COACHING_LLM_PORT` Symbol DI token and the `CoachingLlmPort { generatePlan(bundle): Promise<LlmPlanResult> }` interface (`src/modules/coaching/ports/coaching-llm.port.ts`). The new `ai` module implements the adapter (config-driven provider, structured-output parsing); fakes are used in tests. Coaching depends on the port, never on a concrete provider, so the LLM can be swapped/faked without touching Coaching logic.

**Grounding bundle (deterministic, in-memory)**: assembled by `coaching-grounding.service.ts` from: assessment evidence (`ScoredResultDto` — domain scores/bands, strongestDomain, supportDomain, selectedPriorities as **CODES**; **NO** raw answers, free-text, or safety data) + profile fields + the pinned `CoachingActionLibrary` version+content (looked up by the **exact required `libraryVersion`** and integrity-verified against `COACHING_LIBRARY_V1`) + the pinned `CoachingDisclaimer` version+copy (exact `disclaimerVersion`, integrity-verified against `COACHING_DISCLAIMER_V1`) + `promptVersion` + instructions. The library grounds and constrains allowed ids; the validator rejects `libraryKey`s not in the pinned version.

**Structured output + validation**: the LLM returns a strict versioned `LlmPlanOutput` (full bilingual `{en, ar}`: title, summary, focus areas[domain, source, reason], goals[libraryKey], actions[libraryKey, position, pacingLabel, copy], disclaimer reference). The deterministic `coaching-plan-validator.ts` validates: schema shape, allowed library ids (present in pinned `libraryVersion`), limits (focus areas ≤ 3, action/goal bounds), safety (no clinical/diagnostic/medication/crisis content; concerning-output detection), required sections, assessment traceability (domains/sources traceable to the bundle), and bilingual completeness (en+ar non-empty). Reject → `CoachingPlan.generationStatus = FAILED` (`planStatus` stays null), persist **no** usable plan, `503 PLAN_UNAVAILABLE` on GET. Accept → in one transaction set `CoachingPlan.generationStatus = READY` **and** `planStatus = PROPOSED` and persist the plan + sub-entities, guarded by the late-result conditional update on `currentAttemptId` (FR-006c/FR-006f/FR-029).

---

## 8. UserAccount back-relation (Auth — minimal addition)

Append to `UserAccount` (feature 001):
```
coachingPlans CoachingPlan[]   // back-relation only; Auth does not read/write coaching tables
```
No other change to `UserAccount`. Coaching accesses the user only via `req.user.sub` + the `userId` FK; it does not import `AuthModule` for data access (only for `ConsentService` via the `AuthModule` export, as feature 001 does).

---

## Enums

- **`CoachingPlanStatus`** (plan lifecycle; nullable column **`planStatus`** on `CoachingPlan`): `PROPOSED`, `ACTIVE`, `COMPLETED`. (`PROPOSED` = validated and awaiting explicit user accept, set atomically with `generationStatus → READY`; `ACTIVE`/`COMPLETED` are the post-acceptance lifecycle. **No** `PENDING`/`GENERATING`/`FAILED` — those are `CoachingGenerationStatus` values, on `generationStatus`, not `planStatus`. No `SUPERSEDED`.) Was a 6-value enum; now 3 values after the lifecycle & async-execution correction (spec §1, A4/A5/A14, FR-006c). The persisted column is named `planStatus` (not `status`) to distinguish it from `ActionStep.status` (`ActionStatus`) and `CoachingPlanGeneration.status` (`CoachingGenerationStatus`).
- **`CoachingGenerationStatus`** (one generation attempt's progress; a column on `CoachingPlan` **and** on `CoachingPlanGeneration`): `PENDING`, `GENERATING`, `READY`, `FAILED`. (`PENDING` = awaiting claim; `GENERATING` = claim taken, provider call in flight; `READY` = validation passed (atomically sets `CoachingPlanStatus = PROPOSED`); `FAILED` = provider/validation failure or stale reclaim (never a `CoachingPlanStatus`).) Already existed; now ALSO a column on `CoachingPlan`, not only on `CoachingPlanGeneration`.
- **`ActionStatus`**: `INCOMPLETE`, `COMPLETE`.

These are enums in `schema.prisma`, scoped to the Coaching module. No feature-001 enum is modified. `CoachingPlanStatus` is **nullable** on `CoachingPlan.planStatus` (null until `generationStatus = READY`); `CoachingGenerationStatus` is **non-null** with default `PENDING` on both `CoachingPlan.generationStatus` and `CoachingPlanGeneration.status`; `ActionStatus` is **non-null** with default `INCOMPLETE` on `ActionStep.status`.

---

## State machines

Generation and lifecycle are **two independent concepts** modeled as two separate enums on `CoachingPlan` (spec §1, A14/A18, FR-006c). They transition independently except for the one atomic `generationStatus → READY` + `planStatus → PROPOSED` step on successful validated generation.

**CoachingPlan.generationStatus** (CoachingGenerationStatus — one generation attempt's progress):
```
[creation]                       → PENDING        (planStatus=null; currentAttemptId=null)
PENDING   --atomic claim------->  GENERATING      (conditional UPDATE WHERE generationStatus='PENDING': sets generationStartedAt, generationDeadlineAt, currentAttemptId + inserts/claims a CoachingPlanGeneration attempt row; only one worker/request succeeds)
GENERATING --success (atomic)->  READY           (validation passed; ONE transaction: generationStatus=READY AND planStatus=PROPOSED AND persist plan content + sub-entities; guarded on currentAttemptId)
GENERATING --failure---------->  FAILED          (provider/validation failure; planStatus stays null; no usable plan content)
GENERATING --stale reclaim---->  FAILED          (now() > generationDeadlineAt on GET/POST: stale CoachingPlanGeneration row FAILED TIMEOUT/STALE; generationStatus → PENDING)
FAILED    --retry (same row)--->  PENDING         (POST while FAILED: generationStatus FAILED→PENDING on the SAME CoachingPlan row + NEW CoachingPlanGeneration attempt row; planStatus stays null)
```

**CoachingPlan.planStatus** (CoachingPlanStatus — plan lifecycle; nullable until `generationStatus = READY`):
```
(null)         --gen READY----->  PROPOSED        (atomic with generationStatus→READY; awaiting explicit user accept)
PROPOSED       --POST /accept->  ACTIVE          (explicit acceptance; touches ONLY planStatus, never generationStatus)
ACTIVE         --all COMPLETE->  COMPLETED       (auto lifecycle recompute on PATCH; touches ONLY planStatus)
COMPLETED      --any INCOMPLETE-> ACTIVE          (auto lifecycle recompute on PATCH; touches ONLY planStatus)
```
PATCH is allowed only while `generationStatus = READY` **and** `planStatus` is `ACTIVE`/`COMPLETED`. The `ACTIVE⇄COMPLETED` transition is transactional with the triggering action update (FR-022b) and persisted, and touches **only** `planStatus` (never `generationStatus`). No client-supplied `planStatus`. No `PAUSE` (out of scope — A5). No `SUPERSEDED`. `PROPOSED` is reached only after successful generation + validation (the atomic `READY`+`PROPOSED` step); `ACTIVE` is reached only via `POST /coaching/plan/accept`. `FAILED`/`PENDING`/`GENERATING` never appear on `planStatus` (they are `CoachingGenerationStatus` values, on `generationStatus`).

**CoachingPlanGeneration.status** (CoachingGenerationStatus — one attempt row; prior rows immutable; this attempt-row column is named `status`, distinct from the parent plan's `planStatus`):
```
PENDING   --atomic claim----> GENERATING   (startedAt/deadlineAt set; parent CoachingPlan.generationStatus=GENERATING)
GENERATING --success--------> READY        (parent CoachingPlan: generationStatus=READY AND planStatus=PROPOSED atomically; persist guarded on currentAttemptId)
GENERATING --failure--------> FAILED       (parent CoachingPlan.generationStatus=FAILED; planStatus stays null)
GENERATING --stale reclaim--> FAILED       (TIMEOUT/STALE errorCode; parent CoachingPlan.generationStatus → PENDING)
```
A retry inserts a **new** row (`attempt = prev + 1`) and does not mutate prior attempt rows. A late result from an expired attempt persists only via the conditional update guarded on `CoachingPlan.generationStatus='GENERATING' AND currentAttemptId=:thisAttemptId`; a newer claim → 0 rows → discarded.

**ActionStep.status** (ActionStatus — the per-action completion column; distinct from `CoachingPlan.planStatus` and `CoachingPlanGeneration.status`):
```
INCOMPLETE ⇄ COMPLETE     (user toggle via PATCH while generationStatus=READY AND planStatus is ACTIVE/COMPLETED; idempotent no-op if same; concurrent-safe via version — research D8)
```

---

## Validation rules (cross-cutting)

- **Eligibility** (FR-001): `OnboardingState = COMPLETED` + a scored `AssessmentResult` exists + `SafetyService.currentLevel ∈ {NORMAL, DISTRESS}`. Enforced in `CoachingPlanService` before any get-or-create/generation; re-checked on `PATCH` (a user who later enters `SAFETY_HOLD` cannot mutate actions).
- **Ownership** (FR-031/FR-032): `userId` always from `req.user.sub`; `GET /coaching/plan` has no plan-id param (resolved server-side); `PATCH .../actions/:action_id` validates `action_id` belongs to the user's current plan via the `plan.userId` join. Foreign/unknown action_id → `404 ACTION_NOT_FOUND` (same code — no existence leak, US5).
- **Idempotent get-or-create** (FR-008): `@@unique([userId, sourceResultId])` + conditional insert + P2002 re-read (research D5).
- **Transactional creation** (FR-029): `CoachingPlan` + all `FocusArea`/`Goal`/`ActionStep` persisted in one `prisma.$transaction` once validation passes, or nothing.
- **No raw assessment data in responses** (FR-017/A10): the `source` object exposes only `assessment_id`/`result_id`/`definition_version`/`library_version`; no domain scores, answers, free text, or safety data. The grounding bundle is in-memory only; `CoachingPlanGeneration` stores no raw assessment content.
- **Reproducibility + grounding**: deterministic components (grounding bundle assembly, validator) are reproducible; the LLM output is validated, not trusted. Allowed library ids are enforced (validator rejects `libraryKey`s not in the pinned `libraryVersion`). Safety/traceability/bilingual checks are enforced. Tests use fakes (no live provider calls). A successful validated generation transitions `generationStatus → READY` and `planStatus → PROPOSED` **atomically** (one transaction); a plan has no usable lifecycle/content until `generationStatus = READY`.
- **Structured-output validation**: `coaching-plan-validator.ts` validates the `LlmPlanOutput` (schema, allowed library ids, limits, safety/clinical/diagnostic/medication/crisis + concerning-output detection, required sections, assessment traceability, bilingual completeness). Accept → one atomic transaction sets `CoachingPlan.generationStatus = READY` **and** `planStatus = PROPOSED` and persists the plan + sub-entities (FR-006c/FR-029). Reject → `CoachingPlan.generationStatus = FAILED` (`planStatus` stays null), **persist no usable plan**, `503 PLAN_UNAVAILABLE` on GET. A `generationStatus = FAILED` row keeps `isCurrent=true` so GET shows failed/unavailable and retry targets the same row.
- **Generation idempotency (two-status)**: a repeated `POST /coaching/plan` for a current plan whose `generationStatus` is not `FAILED` returns it without a duplicate row and without a duplicate provider call. A `generationStatus = FAILED` current plan triggers a re-attempt on the **same** `CoachingPlan` row (`generationStatus: FAILED → PENDING` + a **new** `CoachingPlanGeneration` attempt row, `attempt` incremented; `planStatus` stays null throughout the retry until a successful `READY` claim). A UI locale change transitions neither `generationStatus` nor `planStatus` and never invokes generation (FR-035).
- **Explicit acceptance (touches only `planStatus`, never `generationStatus`)**: `POST /coaching/plan/accept` transitions **only** `planStatus: PROPOSED → ACTIVE` (allowed only when `generationStatus = READY` and `planStatus = PROPOSED`; idempotent no-op if already `ACTIVE`/`COMPLETED`; `409 PLAN_NOT_READY` if `generationStatus ≠ READY`; `409 PLAN_UNAVAILABLE` if `generationStatus = FAILED`; `409 SAFETY_HOLD` if the user entered `SAFETY_HOLD` after generation). `PATCH .../actions/:action_id` only when `generationStatus = READY` **and** `planStatus` is `ACTIVE` or `COMPLETED` (else `409 PLAN_NOT_READY` / `409 PLAN_NOT_ACTIVE` — FR-028/FR-034). No client-supplied `planStatus`.
- **Async execution safety (no Redis, no job queue, but no untracked fire-and-forget — A18/FR-006f/SC-017)**:
  - **Atomic generation claim**: `PENDING → GENERATING` is a single conditional update (`UPDATE CoachingPlan SET generationStatus='GENERATING', generationStartedAt=now(), generationDeadlineAt=now()+lease, currentAttemptId=:attemptId WHERE id=:planId AND generationStatus='PENDING'`); only one worker/request can succeed, so simultaneous retries/claims never start duplicate provider calls.
  - **Tracked in-process runner**: a singleton generation runner (owned by Coaching) holds a registry of in-flight attempts (by `planId`/`currentAttemptId`) with their AbortSignals, triggered by `POST` (start) and by `GET`/`POST` reclaim. NOT an untracked Promise. Requires a long-running containerized NestJS process (§15); if the deployment is serverless/scale-to-zero, the execution-trigger mechanism is NEEDS CLARIFICATION (it would need a real queue).
  - **Lease metadata**: each in-flight attempt has `generationStartedAt` + `generationDeadlineAt` on `CoachingPlan` and `deadlineAt` on the `CoachingPlanGeneration` attempt row. Stale once `now() > generationDeadlineAt`.
  - **Stale recovery (incl. process restart)**: on `GET`/`POST`, if `generationStatus='GENERATING'` AND `now() > generationDeadlineAt` → reclaim: mark the stale `CoachingPlanGeneration` attempt row `FAILED` with a sanitized `TIMEOUT`/`STALE` `errorCode`, set `CoachingPlan.generationStatus='PENDING'`. In-flight tracked promises lost on restart are recovered lazily this way on the next `GET`/`POST` after the deadline.
  - **Late-result guard**: persistting an attempt's result (success or failure) is a conditional update guarded on `CoachingPlan.generationStatus='GENERATING' AND currentAttemptId=:thisAttemptId`; if a newer attempt was claimed (or the plan is already `READY`) → `currentAttemptId` no longer matches → 0 rows → the late result is discarded. A late success from an expired attempt can NEVER overwrite a newer successful attempt.
  - **Provider timeout**: per the adapter config (FR-006a); on timeout the attempt transitions `generationStatus → FAILED` (reclaimable) and a retry creates a new attempt.
  - **Duplicate POST**: returns the same plan and never duplicates an active provider call — if `generationStatus` is already `GENERATING` (lease alive) → `202`, starts nothing; if `READY` → returns the resource without a provider call; if `PENDING` → the atomic claim ensures at most one call; if `FAILED` → retry on the same row.
  - **Retry on the same row**: a `POST` while `generationStatus = FAILED` (or a reclaim) transitions `generationStatus: FAILED → PENDING` on the **same** `CoachingPlan` record and creates a **new** `CoachingPlanGeneration` attempt row; the worker then claims it. No new `CoachingPlan` row is created for a retry.
- **Fail-closed** (FR-010a/FR-012): missing/corrupt library entry for a producible focus area, an unsupported/unknown band/version, a generation error, or a validation reject → `503 PLAN_UNAVAILABLE`; no usable plan persisted.
- **No sensitive telemetry** (FR-039/SC-010): plan/progress content excluded from logs/analytics/traces/error reports via `toSafeLogContext`. `CoachingPlanGeneration.validationOutcome.reasons` and `errorCode` are sanitized; no CoT, no raw content.

---

## Migrations

Forward-only, reviewable Prisma migrations (feature-001 research D1). Appends to the feature-001 set (which ends at `20260801000001_m_preferences_timezone_nullable`). The timestamp `20260801000002` is on the current date (2026-08-01) and ordered immediately after the last feature-001 migration; it follows feature-001's midnight-timestamp convention (`YYYYMMDDHHMMSS` at `00:00:0N`). One new migration:

1. **`20260801000002_m_coaching`** — ordered immediately after `20260801000001_m_preferences_timezone_nullable` (feature-001's last migration). Creates enums **`CoachingPlanStatus`** with **3 values** (`PROPOSED`, `ACTIVE`, `COMPLETED` — was a 6-value enum before the lifecycle & async-execution correction; now 3 values), **`CoachingGenerationStatus`** with **4 values** (`PENDING`, `GENERATING`, `READY`, `FAILED` — now a column on `CoachingPlan` as well as on `CoachingPlanGeneration`), and `ActionStatus` (`INCOMPLETE`, `COMPLETE`). Models `CoachingPlan` with:
   - `planStatus` `CoachingPlanStatus` **nullable, default null** (column named `planStatus`, not `status`, to distinguish it from `ActionStep.status` and `CoachingPlanGeneration.status`; was a 6-value `status` enum + default `PENDING` before the lifecycle & async-execution correction; now 3-value + nullable — null until `generationStatus = READY`; **no** NOT NULL default, since it is nullable);
   - `generationStatus` `CoachingGenerationStatus` **default `PENDING`** (NEW column on the plan);
   - `generationStartedAt` timestamptz nullable (NEW);
   - `generationDeadlineAt` timestamptz nullable (NEW);
   - `currentAttemptId` nullable (NEW — loose ref to `CoachingPlanGeneration.id`, no FK);
   - existing columns retained (`userId`, source pins, `planVersion`, `isCurrent`, `title`, `summary`, `disclaimer`, timestamps);
   - `@@unique([userId, sourceResultId])`, `@@index([userId, isCurrent])`, `@@index([userId])`, `@@index([currentAttemptId])`, and the **raw-SQL partial unique index** `coaching_plan_current_one_per_user ON "CoachingPlan"("userId") WHERE "isCurrent" = true` (research D7 — UNCHANGED).
   `FocusArea`, `Goal`, `ActionStep` (+ `@@index`). **`CoachingPlanGeneration`** with the **new `deadlineAt`** timestamptz nullable (lease expiry for that attempt — alongside `startedAt`/`finishedAt`), plus `@@index([planId])`, `@@index([planId, attempt])`, FK `planId onDelete: Cascade`. Reference tables `CoachingActionLibrary` (`version @unique`) and `CoachingDisclaimer` (`@@unique([version])`); and the `UserAccount.coachingPlans` back-relation (no FK change to feature-001 tables — `sourceAssessmentId`/`sourceResultId`/`currentAttemptId` are loose refs to avoid cross-module FK coupling).

The **partial unique index** is emitted as raw SQL (Prisma `@@unique` cannot express a `WHERE` filter).

**Seed (data migration)**: the versioned reference content (`CoachingActionLibrary` v1.0, `CoachingDisclaimer` v1.0) is seeded from `prisma/seed/coaching-library.ts` + `coaching-disclaimer.ts` via the seed runner (like feature-001 notice/assessment/safety definitions). This content is approved-for-planning; **final clinical/legal sign-off of the library content and the disclaimer is launch-gated** (spec §16; research §summary) and the feature fails closed (`503`) if a producible focus area's entry is missing. The library and disclaimer v1.0 are now the **grounding** inputs for generation (not a client pick-list).

**Prompt-template versioning**: prompt templates are managed by the `ai` module (`src/modules/ai/...`). Each prompt template carries a version string; the `promptVersion` used for a generation attempt is pinned on `CoachingPlanGeneration.promptVersion` so every attempt is reproducible/auditable against a specific prompt version. Prompt versions are immutable once published (new version → new template file + new version string); the `ai` module is the single authoritative source for prompt text.

**Rollback**: migrations are forward-only; reference-content versions and prompt templates are immutable (never altered in place). Account deletion removes user rows via `COACHING_DELETION_PORT` (research D10); reference/definition rows are platform-managed.

---

## Deletion & retention (research D10)

A new `COACHING_DELETION_PORT` (Symbol DI token + `CoachingDeletionPort { deleteExpired(cutoffs); deleteCoachingForUsers(userIds) }` returning `DeletionCategoryCounters`) is implemented by `CoachingDeletionService`, bound with `useExisting`, and exported from `CoachingModule` — the same shape as the four feature-001 deletion ports.

- **`deleteCoachingForUsers(userIds)`** = `coachingPlan.deleteMany({ where: { userId: { in: userIds } } })` — cascades `CoachingPlanGeneration` (via `planId` `onDelete: Cascade` — removes **all** generation attempt rows for the user's plans), `FocusArea`, `Goal`, and `ActionStep`. (Equivalently, an explicit `coachingPlanGeneration.deleteMany({ where: { plan: { userId: { in: userIds } } } })` may be used; the cascade via `planId` is the primary path.) Idempotent, counted, no content logged.
- **`deleteExpired(cutoffs)`** — MVP no-op / forward-compat hook: completed plans are retained while the account exists (mirrors feature-001 completed-result retention, Consent §8). The cutoff shape is defined for forward-compat only; no premature deletion logic (Constitution XII).

**Wiring**:
- **`RetentionModule`**: `imports` CoachingModule; `RetentionService` `@Inject(COACHING_DELETION_PORT)`; add a `coaching` category to `scheduledCutoffs`, `runScheduledCategories`, and the `CategoryCounts` type (update `sumErrors`, `totalCounts`, `EMPTY_COUNTS`).
- **`AccountDeletionService`** (`DELETE /me/account`): `@Inject(COACHING_DELETION_PORT)`; add a `coaching` category in referential order — **after `assessment` (coaching depends on the result) and before `safety`/`profile`/`account`** (cascade-safe: coaching only references `UserAccount`). Update `AccountCategoryCounts` + `sumErrors`.
- The platform `DeletionLog.categoryCounts` jsonb gains a `coaching` entry `{ deleted, errors }` — integers only, no user content (FR-039/SC-010). The `coaching` counter is sanitized (counts rows across `CoachingPlan` + cascaded children incl. `CoachingPlanGeneration`; no content).

---

## Relationships

```
UserAccount 1—* CoachingPlan               (one current per user; historical versions immutable)
CoachingPlan 1—* FocusArea                 (cascade)
CoachingPlan 1—* Goal                      (cascade)
CoachingPlan 1—* ActionStep                (cascade)
CoachingPlan 1—* CoachingPlanGeneration    (cascade; audit/operational metadata only — no CoT/raw/plan copy)
CoachingPlan *—1 CoachingPlanGeneration    (loose ref by currentAttemptId — NOT a FK; pointer to the in-flight attempt for the late-result guard; the attempt row is the child via planId cascade)
FocusArea   1—* Goal                      (cascade)
FocusArea   1—* ActionStep                (cascade; goalId nullable)
Goal        1—* ActionStep                (cascade; nullable side)
CoachingPlan *—1 CoachingActionLibrary    (version pin, loose ref by libraryVersion; grounds + constrains allowed ids)
CoachingPlan *—1 CoachingDisclaimer       (version pin, loose ref by disclaimerVersion; grounds disclaimer copy)
```

No cross-module direct table access (SAD §5 / ADR-005). Coaching reads `AssessmentResult` via the exported `AssessmentResultService.getScoredResult(userId)` (research D2); it reads onboarding/safety via `OnboardingGuardService` / `SafetyService`. `sourceAssessmentId`/`sourceResultId`/`currentAttemptId` are loose string/uuid refs (no FK) to avoid a cross-module FK (and, for `currentAttemptId`, to avoid a cyclic FK with the `planId` cascade). Coaching consumes the LLM via the `COACHING_LLM_PORT` (`CoachingLlmPort`); the `ai` module implements the adapter and prompt templates but owns no entity.

---

## Validation rules recap (cross-cutting)

- Eligibility gate (FR-001): `COMPLETED` + scored result + `NORMAL`/`DISTRESS`.
- Ownership (FR-031/FR-032): JWT userId; action_id via `plan.userId` join; cross-user → 404 (no leak). No `GET /coaching/plan/:id`.
- Idempotent get-or-create (FR-008): `@@unique([userId, sourceResultId])` + P2002 re-read.
- **One current plan per user** (spec §7 PlanVersion; research D7): partial unique index `WHERE "isCurrent" = true` enforces a single current; historical plans' `planStatus` and `generationStatus` are a frozen snapshot, never exposed; no `SUPERSEDED` status. A `generationStatus = FAILED` current plan keeps `isCurrent=true` so GET surfaces failure and retry targets the same row.
- **Two independent statuses** (A14/A18/FR-006c): `generationStatus` (`PENDING`/`GENERATING`/`READY`/`FAILED`) on `CoachingPlan` tracks one generation attempt's progress; `planStatus` (`PROPOSED`/`ACTIVE`/`COMPLETED`, nullable) on `CoachingPlan` tracks the plan lifecycle. A plan has no usable lifecycle/content until `generationStatus = READY` (which atomically sets `planStatus = PROPOSED`). `FAILED` is a `CoachingGenerationStatus`, never a `CoachingPlanStatus`. Acceptance touches only `planStatus`; auto-lifecycle touches only `planStatus`; generation transitions touch only `generationStatus` (except the atomic `READY`+`PROPOSED` step). A UI locale change transitions neither `generationStatus` nor `planStatus` and never invokes generation.
- Transactional creation (FR-029): one `$transaction` for plan + sub-entities once validation passes — `generationStatus → READY` and `planStatus → PROPOSED` set atomically within it.
- Concurrent/idempotent action updates (FR-030/FR-033): conditional `updateMany` + `version`; no-op on same `ActionStep.status`; `409 ACTION_CONFLICT` on stale version. PATCH only while `generationStatus = READY` and `planStatus` is `ACTIVE`/`COMPLETED`.
- Explicit acceptance (touches only `planStatus`): `PROPOSED → ACTIVE` only via `POST /coaching/plan/accept` (allowed only when `generationStatus = READY` and `planStatus = PROPOSED`).
- Auto lifecycle (FR-022a/FR-022b): `recomputePlanStatus` in the PATCH transaction; touches only `planStatus`; no separate complete control.
- Reproducibility + grounding: deterministic bundle/validator; LLM output validated; allowed library ids enforced; safety/traceability/bilingual checks; tests use fakes. Success → atomic `READY`+`PROPOSED`.
- Structured-output validation: validator; reject → `generationStatus = FAILED` (`planStatus` stays null), persist nothing usable, `503 PLAN_UNAVAILABLE`.
- Generation idempotency: no duplicate plans or provider calls on repeated POST (atomic claim); `generationStatus = FAILED` re-attempt on the same row (new `CoachingPlanGeneration` attempt, `generationStatus: FAILED → PENDING`).
- **Async execution safety** (A18/FR-006f/SC-017): atomic `PENDING → GENERATING` claim (one worker wins); tracked in-process runner (registry + AbortSignals); lease (`generationStartedAt`/`generationDeadlineAt` on the plan, `deadlineAt` on the attempt); stale reclaim (GENERATING past deadline → attempt `FAILED` `TIMEOUT`/`STALE`, `generationStatus → PENDING`, incl. process-restart recovery); late-result guard (persist guarded on `currentAttemptId` — a newer claim discards a late/expired result); provider timeout → `FAILED` (reclaimable); duplicate POST → same plan, no duplicate active call; retry → same row + new attempt row. Requires a long-running containerized NestJS process.
- No raw assessment/safety in responses (FR-017). `CoachingPlanGeneration` stores no CoT/raw content/plan copy.
- No sensitive telemetry (FR-039/SC-010).

---

## 300-line note (Constitution VIII)

No single handwritten source file is expected to exceed 300 lines:
- `coaching-grounding.service.ts` — deterministic bundle assembly (assessment evidence + profile + active library + disclaimer + promptVersion + instructions); well under 300.
- `coaching-plan-validator.ts` — deterministic structured-output validation (schema, allowed library ids, limits, safety, traceability, bilingual); under 300.
- `coaching-generation.service.ts` — async two-status state machine (`generationStatus: PENDING→GENERATING→READY|FAILED` with the atomic `READY`+`planStatus=PROPOSED` step, plus `FAILED→PENDING` retry on the same row) + atomic claim + tracked in-process runner registry + `COACHING_LLM_PORT` call + late-result guard; under 300.
- `coaching-llm.port.ts` — `CoachingLlmPort` interface + `COACHING_LLM_PORT` Symbol token; tiny.
- `coaching-lifecycle.ts` — one-line pure `recomputePlanStatus`; tiny.
- `coaching-library.ts` — typed constant + shape; small (content lives in the seed).
- `coaching-plan-mapping.ts` — pure row → DTO; small.
- `coaching-plan.service.ts` + `coaching-action.service.ts` — **planned split**: eligibility + get-or-create + acceptance + transactional persist in one; PATCH + lifecycle recompute + ownership in the other. Both stay under 300 (flagged in tasks.md).
- `coaching.controller.ts`, `coaching.dto.ts`, `coaching.errors.ts`, `coaching-deletion.service.ts`, `coaching-deletion.port.ts` — small.
- `ai` module adapter (`src/modules/ai/coaching-llm.adapter.ts` or similar) + prompt templates — config-driven adapter implementing `CoachingLlmPort`; structured-output parsing; under 300. Prompt template files are content, exempt (see below).
- Frontend `dashboard/page.tsx` — split: presentational logic moved to `coaching-plan-view.tsx` to keep the page under 300.
- `in-memory-prisma.ts` (test helper) — extended with coaching stores + cascades (incl. `CoachingPlanGeneration`); **exempt** (feature-001 precedent; migrations, fixtures, and the in-memory Prisma double are exempt from the 300-line rule).
- Migrations, seed fixtures, and prompt-template content files — **exempt** (Constitution VIII: migrations, fixtures, declarative schema, content).

Files flagged for the 300-line review are recorded in tasks.md (Phase 2).