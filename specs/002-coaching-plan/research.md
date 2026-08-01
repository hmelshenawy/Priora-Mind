# Research — 002-coaching-plan

**Phase**: 0 (Technical decisions resolving unknowns)
**Date**: 2026-08-01
**Status**: All NEEDS CLARIFICATION resolved. The architecture is **hybrid deterministic + LLM**: deterministic rules remain authoritative for eligibility, safety, grounding, and validation; an LLM synthesizes a genuinely personalized bilingual plan from a deterministic grounding bundle (Constitution Principles II, III, IV, VI, VII + "AI and RAG" standards). Principle IV's requirement that AI-generated plans be **explicitly accepted** by the user before activation is now engaged (no longer vacuous). The approved bilingual `CoachingActionLibrary` content and the coaching-scope disclaimer are supplied, launch-gated **grounding sources** (spec §16) and are **not** research decisions; a third versioned artifact — the prompt template — is owned by the AI module and referenced via `promptVersion`. This file resolves only **technical** choices. All decisions are consistent with feature 001's established patterns (research D1–D10 in `specs/001-user-onboarding-and-assessment/research.md`).

Format per decision: **Decision / Rationale / Alternatives considered**. Each decision maps to the FRs/acceptance it unblocks.

---

## D1 — New Coaching module vs. extending an existing module

**Decision**: A new **Coaching** NestJS module at `src/modules/coaching/` owns CoachingPlan, FocusArea, Goal, ActionStep, CoachingPlanGeneration, and the versioned `CoachingActionLibrary` / `CoachingDisclaimer` reference content. `PlanVersion` (spec §7 Key Entity) is modeled as the `planVersion` + `isCurrent` columns on `CoachingPlan` (research D7), **not** a separate Prisma model/table. It follows the per-module file layout established by feature 001 (`<feature>.module.ts`, `<feature>.controller.ts`, `<feature>.service.ts` split for the 300-line rule, `<feature>.dto.ts` Zod schemas, `<feature>.errors.ts` HttpException subclasses, `ports/<feature>-deletion.port.ts` Symbol DI token + `<feature>-deletion.service.ts`). A new `ai` module (`src/modules/ai/`) implements the LLM provider adapter + prompt-template management; `CoachingModule` `imports` the AI module, and the AI module does **not** import Coaching (no circular DI).

**Rationale**: SAD §5 / ADR-005 mandate one owner per entity; SAD §5 already assigns CoachingPlan/Goal/Exercise to a Coaching module that does not yet exist (feature 001 left only a forward-reference `transition_point` copy). Plan generation is a Coaching domain rule (Constitution IV; research D6): Coaching owns the generation *domain rule* (eligibility, grounding-bundle assembly, validation, persistence, lifecycle), and the AI module owns only the provider adapter + prompts. A dedicated module keeps the plan subsystem cohesive (generation + lifecycle + ownership + deletion) and matches the feature-001 precedent of one module per bounded area (Auth/Profile/Assessment/Safety).

**Alternatives considered**:
- **Extend the Assessment module with plan logic** — violates SAD §5 ownership (Assessment owns the assessment result, not derived coaching plans) and couples plan lifecycle to assessment; rejected.
- **Place plan generation entirely in the AI module** — cedes domain decisions (eligibility, safety, validation) to a provider; contradicts Constitution IV and the hybrid ownership boundary (research D6); rejected.
- **A platform "CoachingService" outside any module** — no module home; violates the modular monolith convention; rejected.

---

## D2 — Cross-module read of the AssessmentResult

**Decision**: Coaching reads the scored `AssessmentResult` through a **new exported read service** on the Assessment module — `AssessmentResultService.getScoredResult(userId): Promise<ScoredResultDto | null>` — never via direct Prisma access to assessment tables. `AssessmentModule` adds `AssessmentResultService` to providers **and** `exports`. `CoachingModule` `imports: [AuthModule, ProfileModule, SafetyModule, AssessmentModule]`. The `ScoredResultDto` is a minimal, non-sensitive projection (`resultId, assessmentId, definitionVersion, domainScores, strongestDomain, supportDomain, selectedPriorities, goalFreeText` — no raw answers, no safety id), produced by a pure `toScoredResultDto` added to `assessment-result-mapping.ts`.

**Rationale**: SAD §5 / ADR-005 forbid cross-module direct table access; feature 001 resolves cross-module reads via exported services (`SafetyService` for safety; `OnboardingGuardService` for gating; `ConsentService` for consent). `AssessmentModule` currently exports only `ASSESSMENT_DELETION_PORT`, so a new export is required. The projection excludes raw answers/safety (FR-017/A10) so the boundary itself enforces minimum-exposure. No circular DI: Assessment imports Safety (not Coaching); Safety imports Auth/Profile (not Coaching); Coaching is the only new importer.

**Alternatives considered**:
- **Coaching reads `assessmentResult` via PrismaService directly** — violates SAD §5 / ADR-005 and the feature-001 "no cross-module direct table access" rule; rejected.
- **A shared "ResultReadPort" Symbol token like the deletion ports** — viable, but a service export is the established pattern for cross-module *reads* (SafetyService, ConsentService), while Symbol ports are reserved for the deletion contract; choosing a service keeps the convention uniform.
- **Denormalize the result into CoachingPlan at submit time (event)** — adds an event mechanism and a duplicate data store; rejected as premature (Constitution XII); the read service is sufficient and keeps a single source of truth.

---

## D3 — Hybrid plan generation: deterministic grounding + LLM synthesis + deterministic validation

**Decision**: Plan generation is a **hybrid pipeline** owned by Coaching:
1. **Deterministic grounding-bundle assembler** (`coaching/coaching-grounding.ts`) — pure, no DB/network/LLM. Assembles the `GroundingBundle` (research D4/D16): the `ScoredResultDto` projection (domain scores/bands, `strongestDomain`, `supportDomain`, `selectedPriorities` as **CODES only** — NO raw answers, NO free-text, NO safety), the profile fields needed, the pinned `CoachingActionLibrary` version+content (looked up by the **exact required `libraryVersion`** and integrity-verified against `COACHING_LIBRARY_V1`), the pinned `CoachingDisclaimer` version+copy (exact `disclaimerVersion`, integrity-verified against `COACHING_DISCLAIMER_V1`), the prompt-template version, and instructions enforcing scope/safety/structured-output/bilingual.
2. **LLM synthesis via `COACHING_LLM_PORT`** (research D14) — the AI module's `CoachingLlmAdapter.generatePlan(bundle): Promise<LlmPlanResult>` returns a strict versioned `LlmPlanOutput` schema (full bilingual {en,ar}: title, summary, focus areas, goals, actions, disclaimer reference). The LLM **synthesizes genuinely personalized copy** from the grounding bundle; it does **not** decide eligibility or safety, and **must not** invent diagnoses, clinical conclusions, medication advice, crisis counselling, or unsupported user facts.
3. **Deterministic validator** `coaching-plan-validator.ts` — validates the `LlmPlanOutput` (research D15): schema, allowed library ids, limits, safety, required sections, assessment traceability, bilingual completeness. Reject → `FAILED`, persist no usable plan.

**Determinism is REPLACED by reproducibility**: LLM output is non-deterministic. The same grounding bundle does not yield a byte-identical plan. Tests use deterministic fakes (`FakeCoachingLlmAdapter`); automated tests MUST NOT call live paid providers. Generation metadata (research D16) makes each generation auditable.

**Selection rules (A6, deterministic evidence fed to the LLM)**: focus-area **evidence** is computed in fixed priority order — (1) the user's selected priorities in `ranking` order (source `priority`), (2) `support_domain` (source `support`), (3) the lowest-banded remaining domains (score asc, fixed `DOMAIN_ORDER` tie-break, source `lowest_band`), deduplicated, capped at three. The LLM **synthesizes copy** (title, summary, focus-area reasons, goal/action text) but every goal/action **must reference an approved library key** (`libraryKey`); the validator rejects any `libraryKey` not present in the pinned library version. The library grounds + constrains allowed ids (it is **not** a pick-list the LLM copies verbatim — the LLM produces personalized bilingual copy that references approved keys).

**Fail-closed** now covers: provider failure, malformed/unparseable output, schema/validation failure, missing/corrupt/unapproved grounding content, and concerning-output detection (clinical/diagnostic/medication/crisis content) → `FAILED` + `503 PLAN_UNAVAILABLE`; no usable plan is persisted (FR-010a/FR-012). The LLM never receives raw answers, free-text, or safety content (Constitution VI/VII). `goalFreeText` is **excluded** from the grounding bundle by default (open privacy decision — see Summary).

**Rationale**: Constitution IV requires domain rules deterministic wherever practical; eligibility, safety gating, grounding-bundle assembly, and structured-output validation remain deterministic, while the LLM performs the synthesis task it is suited for. Constitution IX requires independent testability, satisfied via deterministic fakes + fixture-driven validator tests. Constitution II/VI/VII govern the bounded context sent to the provider, the no-raw-safety boundary, and the no-chain-of-thought persistence rule.

**Alternatives considered**:
- **Pure deterministic generator (no LLM)** — the prior design; reversed because personalization is now a core product capability; rejected for this feature.
- **LLM with no deterministic grounding** — unbounded generation, no library id enforcement, unsafe; violates Constitution II/IV; rejected.
- **LLM decides eligibility/safety** — explicitly forbidden; eligibility/safety are deterministic Coaching domain rules; rejected.
- **Send raw answers/free-text/safety to the LLM** — violates Constitution VI/VII and FR-017; rejected (free-text excluded by default).

---

## D4 — CoachingActionLibrary + disclaimer + prompt template as versioned grounding artifacts

**Decision**: The approved bilingual `CoachingActionLibrary` (focus-area reasons, goals, action steps, pacing) and the `CoachingDisclaimer` are stored as **versioned, immutable reference data** (one row per published version), mirroring feature 001's `AssessmentDefinition` / `SafetyCopy` / `NoticeVersionSet` (research D5 in feature 001). They are now **grounding sources** for generation, not a pick-list. Two reference tables: `CoachingActionLibrary { id, version @unique, content:Json, publishedAt }` and `CoachingDisclaimer { id, version, copyEn, copyAr, publishedAt, @@unique([version]) }` — **no `isActive`/active-flag column on either**; selection is by **exact required-version lookup + integrity verification** against the authoritative TS constants (research D3), not by an active/approved database flag. Each `CoachingPlan` pins the `libraryVersion` and the disclaimer version it was produced under; plans are never silently recomputed under a newer version (FR-009).

A **third versioned artifact — the prompt template** — is owned by the AI module (`src/modules/ai/prompt-templates/`) and referenced on each generation via `promptVersion` (recorded on `CoachingPlanGeneration`, research D16). Prompt templates are versioned, immutable-once-published, and clinically/safety-reviewed before activation (Constitution III — see Summary launch gate 3).

**Single authoritative source of content**: there is exactly **one** authoritative copy of the library content — the typed `COACHING_LIBRARY_V1` constant (with its `CoachingLibraryContent` shape) defined in `src/modules/coaching/coaching-library.ts`. (a) The deterministic grounding assembler imports this constant (compiler-checked, runtime source — research D3). (b) The seed runner (`prisma/seed/coaching-library.ts`) **imports** `COACHING_LIBRARY_V1` from the module and **creates the `CoachingActionLibrary` DB row (v1.0) if the version does not exist**; if the version already exists it **verifies the stored content + integrity representation against the constant** — succeeding unchanged when identical and **failing loudly on any difference** (it never updates or overwrites an existing version); it does **not** redefine the content. (c) The persisted DB `content` JSON is an **immutable snapshot** of that single constant, written once at seed time and used as the audit/version pin recorded on each plan — it is not an independent, editable copy. The same single-source + immutable-create-or-verify rule applies to the disclaimer: one `COACHING_DISCLAIMER_V1` constant (in `src/modules/coaching/coaching-disclaimer.ts`), imported by both the grounding assembler and the seed. The prompt template is the single authoritative source of generation instructions, pinned by `promptVersion`. No duplicate independent copies of the approved bilingual content are maintained.

**Library constrains allowed ids**: the validator (research D15) rejects any goal/action `libraryKey` not present in the pinned `libraryVersion`. The library is therefore both a **grounding** source (the LLM sees approved content) and a **constraint** (only approved ids are accepted in output).

**Rationale**: Versioned immutable reference content is the established feature-001 pattern (research D5); it preserves historical fidelity (a plan generated under library v1.0 stays correct even after v1.1 ships) and makes the content auditable and independently reversible (Constitution III). Keeping a single TS constant as the source of truth gives compiler-checked access at runtime; the persisted DB row is a deployable audit record/version pin, not a second source of content that could drift. Adding prompt-template versioning as a third artifact extends the same pattern to generation instructions. Pinning the version on `CoachingPlan`/`CoachingPlanGeneration` satisfies FR-009 (source pinning) and the safe-retake boundary (A9).

**Launch gate (not a planning decision)**: final clinical/legal sign-off of the `CoachingActionLibrary` content and the coaching-scope disclaimer in both languages is a launch gate (spec §16). Prompt-template review (Constitution III) and provider data-retention/training policy review (Constitution VI) are additional launch gates (see Summary). The seed ships approved-for-planning v1.0; the feature fails closed (`503 PLAN_UNAVAILABLE`) if a producible focus area's library entry is missing or grounding is corrupt/unapproved. The specification and implementation MUST NOT invent clinical/diagnostic/medication content as a substitute (FR-010a).

**Alternatives considered**:
- **Two independent copies (module constant + separate seed constant)** — risks drift between the grounding assembler's source and the persisted DB row; rejected in favor of one constant imported by both.
- **Hard-coded TS constants only (no DB rows)** — simple, but no DB-level immutability/version pinning/audit; rejected for content that must be pinned to each plan and auditable.
- **JSON files in the repo** — reviewable, but no DB-level immutability and harder to version-pin to user records.
- **A separate CMS** — out of MVP scope (Constitution XII).
- **Invent minimal clinical content to unblock** — explicitly forbidden (Constitution I/III; FR-010a); rejected.
- **Unversioned prompt templates** — would make generation unauditable and unauditable-reversible; rejected (Constitution III).

---

## D5 — Idempotency for plan get-or-create

**Decision**: Idempotency via a **deterministic server-side guard keyed by `(userId, sourceResultId)`** — the same approach feature 001 uses for assessment submit (feature-001 research D6), not client-supplied idempotency keys. `CoachingPlan` has `@@unique([userId, sourceResultId])`; the get-or-create flow is:
1. `existing = coachingPlan.findFirst({ where: { userId, sourceResultId, isCurrent: true } })`; if found → return mapped plan (no duplicate, FR-008/SC-002).
2. Else generate; on `PlanUnavailableError` → `503` (no plan persisted).
3. Persist `CoachingPlan` + all `FocusArea`/`Goal`/`ActionStep` in one `prisma.$transaction` (FR-029).
4. A concurrent create throws Prisma P2002 on the unique constraint; catch → re-read existing + return (AC-X2).

Repeated requests, refreshes, reloads, and re-logins return the existing plan; no duplicate is created (FR-008). The unique constraint is also the source-pinning mechanism for safe retakes (research D7): a future new `resultId` yields a new plan row; the old row is retained, immutable.

**Rationale**: The spec mandates "one active plan per user" (A3) and "exactly one plan" (FR-008), so the natural key *is* the idempotency key. Client-supplied idempotency keys add a column + header protocol without removing the need for the server-side guard — Constitution XII discourages speculative infrastructure. The conditional `@@unique` + transactional persist + P2002 re-read is the standard robust pattern for double-click/retry/concurrent-tabs (feature-001 precedent).

**Alternatives considered**:
- **Client-supplied `Idempotency-Key` header + dedup table** — robust general pattern, but adds infra this feature does not need; can be introduced if a future feature lacks a natural key.
- **Optimistic lock with `version` column for creation** — the `@@unique` constraint already provides the duplicate-guard; `version` is reserved for action-progress concurrency (research D8).
- **Distributed lock (Redis)** — premature for a modular monolith (Constitution XII); the DB guard is sufficient and transactional.

---

## D6 — Generation ownership: Coaching owns the domain rule; AI owns the adapter (SAD ADR-007, revised)

**Decision**: Coaching owns the **generation domain rule** — eligibility, grounding-bundle assembly, provider invocation orchestration, deterministic validation, persistence, lifecycle, and idempotency. The **AI module** owns only the **provider adapter** (`CoachingLlmAdapter` implementing `COACHING_LLM_PORT`) and **prompt-template management**. The AI module's "plan generation" responsibility is the provider adapter + prompts, **not** domain decisions. The AI module MUST NOT bypass Coaching validation or ownership; it produces an `LlmPlanResult` that Coaching validates before persisting. `CoachingModule` `imports` the AI module; the AI module does **not** import Coaching (no circular DI). Recorded as a **revised ADR-007** + SAD §5/§7 clarification (spec §17). ActionStep fulfills the SAD "Exercise" role for this feature (noted in the SAD §5 mapping).

**Rationale**: Constitution IV attributes domain rules to the owning module; eligibility, safety, grounding, validation, lifecycle, and persistence are Coaching domain rules and must stay deterministic and non-delegable. The LLM synthesis is a provider capability, owned by the AI module behind an interface owned by the consumer (Constitution VIII — consumer owns the interface). Recording this as a revised ADR prevents a future change from bypassing the deterministic ownership/validation boundary (FR-007) and keeps the hybrid invariant explicit in the architecture record.

**Alternatives considered**:
- **Leave SAD §5 unchanged (AI owns all generation)** — cedes domain decisions to a provider; contradicts Constitution IV and the hybrid boundary; rejected (Constitution XI — docs/impl sync).
- **Move all generation to the AI module** — cedes eligibility/safety/validation to a provider; rejected.
- **Coaching owns the adapter too (no AI module)** — couples Coaching to a specific provider, blocks config-driven provider/model swap, and scatters prompt templates outside their owner; rejected.
- **No ADR, only a §5 note** — an ADR is the established format for ownership decisions (ADR-005/ADR-006); rejected in favor of a revised ADR-007 for parity.

---

## D7 — Assessment-retake and historical-plan model

**Decision**: Each `CoachingPlan` pins `sourceAssessmentId`, `sourceResultId`, `definitionVersion`, `libraryVersion`, `disclaimerVersion`, `promptVersion`, and `planVersion`; **immutable after creation except `planStatus` (auto-recomputed post-acceptance — research D9), `generationStatus` (drives generation/retry — research D13/D17/D18), the lease metadata (`generationStartedAt`/`generationDeadlineAt`/`currentAttemptId` — research D16/D18), and `isCurrent` (the supersede flip)**. `@@unique([userId, sourceResultId])` (research D5) means a future retake producing a new `AssessmentResult` (new `resultId`) yields a **new** plan row; the old row is retained, immutable (FR-011). Retake triggers a **new generation** (a new `CoachingPlanGeneration` attempt and a fresh LLM synthesis under the then-active library/disclaimer/prompt versions).

**Authoritative "current plan" behavior**: exactly **one** plan per user is current at a time (`isCurrent=true`); all other historical plans are `isCurrent=false`. This is enforced at the DB level by a **partial unique index** `coaching_plan_current_one_per_user ON "CoachingPlan"("userId") WHERE "isCurrent" = true` (raw SQL in the migration — Prisma `@@unique` cannot express a `WHERE` filter). This diverges deliberately from feature-001's `SafetyEvaluation`, which uses only `@@index([userId, isCurrent])` + an app-level flip: the spec here mandates "only one version is current/active per user at a time" (spec §7 PlanVersion) and FR-011 forbids any silent overwrite, so a hard DB guarantee is warranted to prevent two currents from ever coexisting under a bug or race.

**No SUPERSEDED status**: the plan carries **two independent status columns** (research D17): `generationStatus` (`PENDING | GENERATING | READY | FAILED`) for one generation attempt, and `planStatus` (`PROPOSED | ACTIVE | COMPLETED`, nullable until `generationStatus = READY`) for the plan lifecycle. There is no single 6-value `status` enum and no `SUPERSEDED` value. A superseded historical plan is **not** relabeled; it keeps its final `planStatus` (and `generationStatus = READY`) as a **frozen immutable snapshot** of where it was when superseded (or `COMPLETED` if all its actions were done). That frozen `planStatus` is **not** a live "active" indicator and cannot create ambiguity, because only the `isCurrent=true` plan is returned by `GET /coaching/plan` and mutable via `PATCH`; `isCurrent=false` plans are never exposed by either endpoint (contracts/coaching-plan.md). Thus an old plan never "remains ambiguously current or ACTIVE alongside the newly generated plan."

**Future regenerate (retake) flow**: regeneration is **user-initiated only** (NOT automatic — FR-011) and is a **defined future boundary** — not built in this feature. The model already supports it: a future "regenerate from latest assessment" endpoint would, in **one transaction**, (a) flip the prior plan `isCurrent=false` (its frozen `planStatus` is untouched), then (b) insert the new plan `isCurrent=true` pinned to the new `resultId`/`planVersion` and trigger a new generation. The partial unique index forces this order — inserting the new current before flipping the old would violate the index and rollback, guaranteeing no two currents. For MVP (no retakes — feature 001 FR-018a), the single plan is `isCurrent=true, planVersion=1`, and the partial unique index trivially allows it. Historical plans are immutable.

**Rationale**: Spec A9/FR-009/FR-011 require safe retake behavior even though retakes are currently impossible. Source-pinning + immutable history + a DB-enforced single `isCurrent` + a frozen historical `planStatus` is the simplest model that never silently overwrites a historical plan (AC-X6), never leaves two plans ambiguously current/active, and supports a future regenerate action without a separate history table (Constitution XII). This mirrors feature 001's `SafetyEvaluation` append-only + `is_current` pattern (feature-001 research D9) adapted to plans, strengthened by a partial unique index where the spec's one-current invariant requires it.

**Alternatives considered**:
- **Single mutable `CoachingPlan` updated in place on retake** — violates FR-011 (no silent overwrite); rejected.
- **A separate `PlanVersionHistory` table** — viable, but a single `CoachingPlan` table with `planVersion` + `isCurrent` is simpler (Constitution XII) and equivalent.
- **A `SUPERSEDED` status for historical plans** — not a valid value in either enum (`planStatus` is `PROPOSED | ACTIVE | COMPLETED`; `generationStatus` is `PENDING | GENERATING | READY | FAILED`); adds an extra enum value and a relabel step with no benefit, since `isCurrent=false` already marks non-current plans and their frozen `planStatus` is never shown; rejected.
- **App-level flip only (no partial unique index)** — leaves a window where two `isCurrent=true` rows could coexist under a bug/race; insufficient for the spec's hard one-current invariant; rejected in favor of the DB-level guarantee.
- **Auto-regenerate whenever a new result appears** — forbidden (FR-011: regeneration is user-initiated only); rejected.

---

## D8 — Concurrent / idempotent action-progress updates

**Decision**: Action-progress updates use **conditional `updateMany` + an optimistic `version` counter** on `ActionStep`, mirroring feature 001's conditional-update idempotency (feature-001 research D6) and adding optimistic concurrency for the multi-tab case (AC-X5). Flow:
1. **Ownership** — `actionStep.findFirst({ where: { id, plan: { userId, isCurrent: true } } })`; null → `404 ACTION_NOT_FOUND` (same code for foreign + unknown — no existence leak, US5/FR-032).
2. **Idempotent no-op** — if the action's current status already equals the target → return success without writing (FR-030).
3. **Conditional update** — `updateMany({ where: { id, status: { in: [oldStatus] }, ...expected_version }, data: { status, version: { increment: 1 }, updatedAt } })`; `count===0` → re-read; if already at target → no-op success, else `409 ACTION_CONFLICT` (client refetches the plan).
4. **Lifecycle recompute** — in the same transaction, `incompleteCount = actionStep.count({ where: { planId, status: 'INCOMPLETE' } })`; `newPlanStatus = recomputePlanStatus(incompleteCount)`; write `coachingPlan.planStatus` (research D9). The recompute touches **only** `planStatus` and never `generationStatus` (research D9/D17).

The `version` field increments on every real change; a stale client sending `expected_version` gets a deterministic conflict instead of a lost update. The conditional `where.status.in` guard also makes the same-status update a no-op at the DB level.

**Rationale**: FR-030 (idempotent progress) + FR-033/AC-X5 (concurrent updates, no lost update) require a server-side guard. The conditional `updateMany` is the established feature-001 pattern; adding `version` gives optimistic concurrency for the multi-tab case without a distributed lock (Constitution XII). Running the lifecycle recompute in the same transaction keeps the visible state consistent (FR-022b).

**Alternatives considered**:
- **Last-write-wins (plain `update`)** — lost updates possible; violates AC-X5; rejected.
- **Distributed lock (Redis)** — premature for a modular monolith; the conditional update + version is sufficient; rejected (Constitution XII).
- **Pessimistic row lock (`SELECT ... FOR UPDATE`)** — heavier; unnecessary contention between updates to different actions; rejected.
- **Client-supplied idempotency keys per action update** — adds a column + header protocol; the `version` + conditional update already provide the guarantee; rejected.

---

## D9 — Automatic ACTIVE ⇄ COMPLETED lifecycle (no separate control; operates post-acceptance on PlanStatus only)

**Decision**: A pure helper `coaching-lifecycle.ts` → `recomputePlanStatus(incompleteCount: number): 'ACTIVE' | 'COMPLETED'` (= `incompleteCount === 0 ? 'COMPLETED' : 'ACTIVE'`), unit-testable in isolation. It is called inside the PATCH transaction after every action update. The `CoachingPlan.planStatus` column is **only** written by this recompute (post-acceptance lifecycle) or by the accept flow (`PROPOSED → ACTIVE` via `POST /coaching/plan/accept`, per Constitution IV's explicit-acceptance requirement), never by the client directly. A plan becomes `ACTIVE` only after the user explicitly accepts a `PROPOSED` plan; it auto-transitions to `COMPLETED` when all actions are complete and back to `ACTIVE` if any action is reopened (FR-022a, A5, AC-X9). There is **no separate "Mark plan complete" control** in the UI or API.

**Scope note (two-status model — research D17)**: the lifecycle recompute touches **only `planStatus`** (`PROPOSED → ACTIVE ⇄ COMPLETED`) and **never `generationStatus`**. `generationStatus` (`PENDING | GENERATING | READY | FAILED`) is owned by the generation/retry flow (research D13/D18) and is untouched by acceptance or action-progress updates. `recomputePlanStatus` operates only on plans whose `generationStatus = READY` and whose `planStatus` is `ACTIVE`/`COMPLETED`; it never runs while a plan is still generating or has failed (`planStatus` is null until `generationStatus = READY`).

**Rationale**: Spec A5/FR-022a explicitly require the lifecycle to be derived solely from action progress with no separate completion control, and A4/A14 require that the lifecycle touches only `planStatus`. Constitution IV requires AI-generated plans be explicitly accepted before activation — the `PROPOSED → ACTIVE` accept transition enforces this (and itself touches only `planStatus`). A pure function is the simplest, fully unit-testable design (Constitution IX; SC-013 is verifiable via fixtures independent of the UI). Keeping the recompute transactional with the triggering action update (FR-022b) prevents a window where the plan status disagrees with its actions.

**Alternatives considered**:
- **A separate `POST /coaching/plan/complete` endpoint** — explicitly rejected by the clarify resolution (spec §Clarifications, A5, FR-022a); no separate control.
- **Recompute via a DB trigger** — hides business logic outside the codebase and is not portable/testable; rejected (Constitution VIII).
- **Recompute on read (lazy)** — allows a window of inconsistent status; rejected in favor of transactional recompute on write (FR-022b).
- **Auto-activate without explicit accept** — violates Constitution IV's explicit-acceptance requirement; rejected.
- **Mutate `generationStatus` from the lifecycle recompute** — conflates generation progress with plan lifecycle (research D17); rejected — the lifecycle touches only `planStatus`.

---

## D10 — Deletion contract and retention wiring

**Decision**: A new **`COACHING_DELETION_PORT`** (Symbol DI token + `CoachingDeletionPort { deleteExpired(cutoffs): Promise<DeletionCategoryCounters>; deleteCoachingForUsers(userIds): Promise<DeletionCategoryCounters> }`) implemented by `CoachingDeletionService`, bound with `useExisting` and exported from `CoachingModule` — the same shape as the four feature-001 deletion ports (AUTH/PROFILE/ASSESSMENT/SAFETY). It is wired into:
- **`RetentionModule`** (scheduled `@Cron` job): `imports` CoachingModule; `RetentionService` `@Inject(COACHING_DELETION_PORT)`; add a `coaching` category to `scheduledCutoffs` + `runScheduledCategories` + the `CategoryCounts` type.
- **`AccountDeletionService`** (`DELETE /me/account`): `@Inject(COACHING_DELETION_PORT)`; add a `coaching` category in referential order — **after assessment (coaching depends on the result) and before safety/profile** (cascade-safe: coaching only references UserAccount).

`deleteCoachingForUsers` deletes `CoachingPlanGeneration` rows (cascade via `planId`) and `coachingPlan.deleteMany({ where: { userId: { in: userIds } } })` (cascades FocusArea/Goal/ActionStep via schema `onDelete: Cascade`). `deleteExpired` is an **MVP no-op / forward-compat hook** — completed plans are retained while the account exists (mirroring feature-001 completed-result retention, Consent §8); the port is wired for symmetry and future orphan-plan cleanup. Deletions are idempotent, counted, and log only sanitized counters (no plan/progress content, no generation metadata content — FR-039/SC-010, research D7 in feature 001).

**Rationale**: FR-040 (account deletion removes plans + sub-entities, including generation metadata) + Constitution VI require plan data to be covered by the per-module deletion-contract pattern. Reusing the exact feature-001 port shape + RetentionModule/AccountDeletionService wiring means there is **one deletion path per entity** and no cross-module direct table access (SAD §5 / ADR-005). MVP `deleteExpired` as a no-op avoids premature retention logic (Constitution XII) while keeping the contract uniform.

**Alternatives considered**:
- **Per-feature ad-hoc deletion (no port)** — duplicates deletion logic and risks inconsistent partial deletion; rejected in favor of the shared contract.
- **Soft-delete plans** — leaves sensitive progress data recoverable; conflicts with full-deletion (FR-040); not chosen for MVP.
- **Define a coaching retention cutoff now** — premature; completed plans are retained while the account exists (feature-001 precedent); the cutoff shape is defined for forward-compat only.

---

## D11 — Localization, accessibility, and frontend conventions

**Decision**: Reuse the feature-001 frontend stack and conventions exactly. A new `coaching` feature area: `src/features/coaching/coaching.api.ts` (`CoachingApiService extends ApiService`, singleton `coachingApi`; `getPlan()`, `acceptPlan()`, `updateAction(actionId, body)`) + `coaching-hooks.ts` (`useCoachingPlanQuery`, `useAcceptPlanMutation`, `useUpdateActionStatusMutation` via TanStack Query). The dashboard page (`src/app/[locale]/(protected)/dashboard/page.tsx`) is rewritten as a client component mirroring `assessment/result/page.tsx` (`useTranslations`, `ApiError` discrimination, `Shell` wrapper, `bilingual()` helper), with `RequireOnboarding` retained. A presentational `coaching-plan-view.tsx` is split out to keep the page ≤300 lines. Plan content is `Bilingual` from the API; UI labels live in a `coaching` namespace in `en.json`/`ar.json` (replacing `protected.dashboardPlaceholder`); no hard-coded user-facing strings. RTL via `<html dir>` only (feature-001 convention). Accessibility: semantic HTML, `<button aria-pressed>`/`<input type="checkbox">` action toggles with visible focus + logical tab order in LTR/RTL, and an accessible progress bar (`role="progressbar"` + `aria-live="polite"` live region announcing "K of N actions complete" — FR-021/FR-038). The `PROPOSED` plan surface presents an explicit accept control before activation (Constitution IV). Shared DTOs added to `shared/src/index.ts` for cross-stack type parity. Playwright e2e stubs backend via `page.route` (no shared auth/seed fixtures).

**Rationale**: Constitution X (bilingual equality) + Frontend §12/§13 require first-class AR/EN + RTL + accessibility from day one; the plan is the primary post-onboarding surface. Mirroring the closest precedent (`assessment/result/page.tsx`) keeps patterns uniform and RTL covered by testing (not only `dir`). Splitting the presentational view respects the 300-line rule (Constitution VIII). The `bilingual()` + cached-bilingual-payload approach means a language switch re-renders the plan without losing progress (US4 scenario 3). The disclaimer missing-string fallback follows the feature-001 §12 rule: no silent cross-language fallback for safety-relevant content; the validator/generator fails closed (503) if the disclaimer is missing.

**Alternatives considered**:
- **A separate `/plans` route** — rejected; the plan is shown on `/dashboard` per A11 and the existing `post_onboarding_route`; `/plans*` is future.
- **Install shadcn/ui for the plan UI** — feature 001 hand-rolls UI on shadcn CSS tokens with no shadcn/ui installation; introducing it now would break convention; rejected.
- **Hard-code bilingual content in the frontend** — violates Constitution X and the single-source-of-truth (backend library) principle; rejected.
- **Optimistic action toggle without conflict handling** — risks lost updates; the 409 → refetch path is required (AC-X5); rejected.
- **Auto-activate without an explicit accept control** — violates Constitution IV; rejected.

---

## D12 — Error model and redaction

**Decision**: Reuse the feature-001 error model: `HttpException` subclasses in `coaching.errors.ts` with stable machine-readable codes, rendered by the global `AllExceptionsFilter` as `{ error: { code, ...extra } }`. New codes (aligned to the two-status model — research D17, and spec FR-034): `PLAN_UNAVAILABLE` (503, fail-closed generation/validation/grounding failure, i.e. `generationStatus = FAILED` on `GET`/accept or a pre-provider grounding failure), `PLAN_NOT_READY` (409, accept or `PATCH` while `generationStatus ≠ READY` — `PENDING`/`GENERATING`/`FAILED`), `PLAN_NOT_ACTIVE` (409, `PATCH` when `generationStatus = READY` but `planStatus` is `PROPOSED` — the plan must be accepted first), `ACTION_NOT_FOUND` (404, foreign + unknown — no existence leak), `ACTION_CONFLICT` (409, optimistic-concurrency), and a coaching-local `SAFETY_HOLD` (409) reusing the feature-001 `SafetyHoldException` pattern (optionally enriched via `SafetyService.currentRoute`). Reused codes: `UNAUTHENTICATED` (401, guard), `ONBOARDING_STEP_BLOCKED` (403, guard), `VALIDATION` (400, Zod), `INTERNAL` (500). Zod validation via `ZodValidationPipe` → `400 VALIDATION { fields }`. No i18n for error codes (stable English strings, feature-001 convention). All endpoints log only sanitized counters via `toSafeLogContext` (`common/redact.ts`); **no plan/progress content, no generation metadata content, no chain-of-thought, no raw assessment content** ever appears in logs/analytics/traces/error reports (FR-039/SC-010, Constitution VI/VII).

**Rationale**: FR-034 (explicit error codes) + FR-039 (no content in telemetry) + SC-010 require the established feature-001 error + redaction model. `ACTION_NOT_FOUND` for both foreign and unknown action ids prevents existence leak (US5). Reusing `AllExceptionsFilter` + `ZodValidationPipe` + `toSafeLogContext` means no new cross-cutting infrastructure (Constitution XII).

**Alternatives considered**:
- **Distinct 403 for foreign action ids** — leaks existence; rejected (US5).
- **An i18n message catalog for error codes** — feature 001 uses stable English codes with bilingual *copy* for user-facing content; introducing error-code translation now would break convention; rejected.
- **Redact at call sites** — fragile; feature 001 centralizes redaction (research D7); rejected.

---

## D13 — Generation lifecycle and async states (two independent statuses)

**Decision**: Generation is **async start + poll** with **in-process + DB-persisted status** and **no new infrastructure** (no job queue, no Redis). The plan carries **two independent status columns** (research D17), not a single 6-value enum:

- **`generationStatus`** (`PENDING | GENERATING | READY | FAILED`; default `PENDING`) — the progress of the **current** generation attempt. Stored on `CoachingPlan` **and** on each `CoachingPlanGeneration` attempt row (research D16).
- **`planStatus`** (`PROPOSED | ACTIVE | COMPLETED`; **nullable** — null until generation succeeds) — the plan lifecycle. Stored on `CoachingPlan` only.

A plan has **no usable lifecycle/content until `generationStatus = READY`**. Successful validated generation transitions `generationStatus → READY` and `planStatus → PROPOSED` **atomically** (one transaction, FR-006c; research D15). `FAILED` is a **GenerationStatus, never a PlanStatus** — on provider/validation failure `generationStatus → FAILED` and `planStatus` stays null (no usable content persisted). There is **no `SUPERSEDED`** value in either enum (research D7).

State behavior:
- `POST /coaching/plan` idempotently creates or returns the current plan (FR-008/SC-002 — see idempotency below). The plan row is created with `generationStatus = PENDING`, `planStatus = null`. The atomic claim then transitions `generationStatus: PENDING → GENERATING` (research D18); a `CoachingPlanGeneration` row is created for the attempt (research D16).
- `GET /coaching/plan` returns `generationStatus` (no plan body) while `PENDING`/`GENERATING`; returns `planStatus` + usable plan content when `generationStatus = READY`; returns a safe retryable failure representation when `generationStatus = FAILED` (no usable plan). There is **no `GET /coaching/plan/:id`** — ownership is JWT-only (preserve feature-001 no-id-in-url convention).
- `POST /coaching/plan/accept` transitions **only** `planStatus: PROPOSED → ACTIVE` (Constitution IV explicit acceptance); it does **not** touch `generationStatus` (research D9/D17). `PATCH` action-progress is permitted only when `generationStatus = READY` and `planStatus` is `ACTIVE`/`COMPLETED`.
- `COMPLETED` is reached by the auto lifecycle (research D9) once all actions are complete; that recompute touches only `planStatus`.
- `generationStatus = FAILED` is terminal for an attempt; a retry transitions `generationStatus: FAILED → PENDING` on the **same current `CoachingPlan` row** and creates a **new** `CoachingPlanGeneration` attempt row (the prior `FAILED` attempt row is retained for audit). No new `CoachingPlan` row is created for a retry.
- A UI locale change transitions **neither** status and never invokes generation (research D11; the plan is always bilingual).

**Idempotency**: `POST /coaching/plan` is idempotent on `(userId, sourceResultId)` (research D5): a repeated POST **must not** duplicate plans or provider calls. If a plan for the current `sourceResultId` already exists:
- `generationStatus = READY` → return the existing plan (`planStatus` is `PROPOSED`/`ACTIVE`/`COMPLETED`); no new generation, no provider call.
- `generationStatus = PENDING`/`GENERATING` → return `{ planId, generationStatus }` (no new generation, no duplicate provider call; the in-flight generation continues; duplicate `POST` never duplicates an active provider call — research D18).
- `generationStatus = FAILED` → retry on the **same** `CoachingPlan` row: transition `generationStatus: FAILED → PENDING`, create a new `CoachingPlanGeneration` row (`attempt = prev + 1`), then the atomic claim transitions `PENDING → GENERATING` and invokes the provider. This retry is concurrency-guarded by the atomic claim (research D18); a second retry while one is `GENERATING` returns the current status and starts no new provider call.

**Retry/timeout behavior**: provider timeouts and retries are controlled by the adapter (research D14) — bounded retry count, bounded timeout. A provider timeout transitions the current attempt `generationStatus → FAILED` (reclaimable); a retry creates a new attempt. Exhausted retries / malformed output / validation failure / missing grounding / concerning output → `generationStatus = FAILED`; no usable plan persisted. The client polls `GET /coaching/plan` (or is notified via the existing query refetch); no WebSocket/SSE is introduced (Constitution XII). Stale/restart recovery and late-result safety are handled by the lease-based execution model (research D18).

**Rationale**: Constitution XII discourages speculative infrastructure (no job queue/Redis for MVP). Splitting generation progress (`generationStatus`) from plan lifecycle (`planStatus`) keeps two independent concepts independent (research D17): `FAILED` is a generation outcome, not a lifecycle; `READY` atomically produces `PROPOSED`; explicit acceptance and the action lifecycle touch only `planStatus`; retry reuses the same plan row and creates a new attempt. The async-start + poll pattern with in-process + DB status is the simplest design that keeps generation off the request critical path while preserving JWT-only ownership. Idempotency on the natural key prevents duplicate plans and duplicate paid provider calls (cost control). Re-attempts on `FAILED` reuse the same plan row so retake/history semantics (research D7) stay clean.

**Alternatives considered**:
- **A single 6-value `status` enum (`PENDING | GENERATING | PROPOSED | ACTIVE | COMPLETED | FAILED`)** — conflates generation progress with plan lifecycle; makes `FAILED` a lifecycle state and requires a single column to encode two orthogonal concepts; rejected (research D17).
- **Synchronous generation on POST** — long latency, poor UX, risk of client timeout; rejected in favor of async start + poll.
- **A job queue (BullMQ/Redis)** — premature for a modular monolith (Constitution XII); in-process + DB status is sufficient (made operationally safe by research D18).
- **`GET /coaching/plan/:id`** — leaks plan ids and breaks JWT-only ownership; rejected.
- **A new `CoachingPlan` row per re-attempt** — violates one-plan-per-result and complicates retake/history; rejected in favor of retry on the same row + new attempt.
- **WebSocket/SSE notifications** — speculative infra for MVP; rejected (Constitution XII).
- **A `SUPERSEDED` status value** — not in either enum; `isCurrent=false` already marks historical plans and their frozen `planStatus` is never shown; rejected (research D7).

---

## D14 — Provider abstraction (`COACHING_LLM_PORT`)

**Decision**: A new **`COACHING_LLM_PORT`** Symbol DI token + `CoachingLlmPort { generatePlan(bundle: GroundingBundle): Promise<LlmPlanResult> }` **owned by Coaching** (consumer owns the interface per Constitution VIII), located at `coaching/ports/coaching-llm.port.ts`. A new **`ai` module** (`src/modules/ai/`) implements the adapter (`CoachingLlmAdapter implements CoachingLlmPort`) + prompt-template management. `CoachingModule` `imports` the AI module; the AI module does **not** import Coaching (no circular DI).

**Configuration**: the provider and model are **config-driven** (`COACHING_LLM_PROVIDER`, `COACHING_LLM_MODEL` via `ConfigService`/env), swappable at deploy time without code changes. Secrets are **server-side only** (never shipped to the client, never logged). Token/latency/timeout/rate-limit/cost controls are enforced by the adapter: per-request timeout, bounded retry count, per-user/per-tenant rate limit, token-budget cap, and latency/cost telemetry written to `CoachingPlanGeneration` (research D16). Instructions in the grounding bundle enforce scope/safety/structured-output/bilingual.

**Fakes for tests**: a deterministic `FakeCoachingLlmAdapter` (in the AI module, selected via a test/diagnostic provider config) is used in all automated tests. **Automated tests MUST NOT call live paid providers.** E2e tests stub the backend via `page.route` (feature-001 convention).

**Rationale**: Constitution VIII (consumer owns the interface) keeps Coaching in control of the contract while delegating the provider capability to the AI module. Constitution XII (no speculative infra) is satisfied by config-driven provider/model swap rather than a per-provider module per plan. Constitution VI/VII (privacy) require secrets server-side and provider data-retention/training policy reviewed before production (launch gate, see Summary). Cost/rate-limit/token controls are first-class because the LLM is a paid, non-deterministic resource.

**Alternatives considered**:
- **Coaching implements the adapter directly** — couples Coaching to a specific provider; blocks config-driven swap; rejected.
- **AI module owns the `CoachingLlmPort` interface** — violates Constitution VIII (consumer owns the interface); rejected.
- **Live provider calls in automated tests** — non-deterministic, costly, and forbidden; rejected.
- **Hard-coded provider/model** — blocks deploy-time swap and A/B; rejected.
- **Client-side secrets** — unsafe; rejected (Constitution VI/VII).

---

## D15 — Structured output and deterministic validation

**Decision**: The LLM returns a strict, versioned **`LlmPlanOutput`** schema (full bilingual {en,ar}):
- `title`, `summary` (bilingual)
- `focusAreas[]`: `{ domain, source, reason }` (bilingual `reason`)
- `goals[]`: `{ libraryKey }`
- `actions[]`: `{ libraryKey, position, pacingLabel, copy }` (bilingual `copy`)
- `disclaimerReference` (version+id of the pinned `CoachingDisclaimer`)

The deterministic **`coaching-plan-validator.ts`** (owned by Coaching) validates:
1. **Schema** — `LlmPlanOutput` shape (Zod or equivalent).
2. **Allowed library ids** — every goal/action `libraryKey` MUST exist in the pinned `libraryVersion` (research D4). Unknown key → reject.
3. **Limits** — focus areas ≤ 3; goal/action counts within library-defined bounds.
4. **Safety** — no clinical/diagnostic/medication/crisis content; **concerning-output detection** (deterministic pattern/keyword sweep on the synthesized copy); fail-closed on any hit.
5. **Required sections** — title, summary, ≥1 focus area, ≥1 goal, ≥1 action, disclaimer reference all present.
6. **Assessment traceability** — focus-area `domain`/`source` MUST correspond to the grounding bundle's computed evidence (A6 priority order, research D3).
7. **Bilingual completeness** — both `en` and `ar` non-empty for every bilingual field.

**Validation outcome → status transitions (two-status model — research D17)**:
- **Validation success** → persist the validated plan + sub-entities + the `CoachingPlanGeneration` audit row, and in the **same atomic transaction** set `CoachingPlan.generationStatus = READY` and `CoachingPlan.planStatus = PROPOSED` (FR-006c; A14). `READY` and `PROPOSED` are set together or not at all — a plan has no usable lifecycle/content until `generationStatus = READY`.
- **Validation failure** (schema, unknown library id, limits, safety, missing sections, traceability, or bilingual completeness) → set `CoachingPlanGeneration.validationOutcome = INVALID` (sanitized reasons, no content) and `CoachingPlan.generationStatus = FAILED`; `CoachingPlan.planStatus` **stays null** (FAILED is a GenerationStatus, never a PlanStatus); **no usable plan is persisted**. Retry transitions `generationStatus: FAILED → PENDING` on the same row + a new attempt (research D13/D18).

**No chain-of-thought (CoT) is persisted** — only the final `LlmPlanOutput` (validated) and operational metadata (research D16).

**Rationale**: Constitution IV requires deterministic validation of AI output before it affects system state. Constitution II/III require safety and auditability. Constitution IX requires the validator be fixture-testable in isolation. The allowed-id rule is what makes the library a **constraint** (not just a grounding source): the LLM may produce personalized copy, but it cannot introduce ids outside the approved library. Bilingual completeness (Constitution X) is enforced structurally, not by best-effort.

**Alternatives considered**:
- **Trust the LLM output** — unsafe; violates Constitution II/IV; rejected.
- **Allow arbitrary ids (no library constraint)** — breaks auditability and the single-source rule; rejected.
- **Persist CoT for debugging** — violates Constitution VI/VII (privacy) and the no-CoT rule; rejected.
- **Best-effort bilingual (allow missing ar or en)** — violates Constitution X; rejected.

---

## D16 — Generation metadata and auditability (`CoachingPlanGeneration`)

**Decision**: A new **`CoachingPlanGeneration`** model, owned by Coaching, records one row **per generation attempt**:
- `id`, `planId` (fk → `CoachingPlan`, `onDelete: Cascade`), `attempt` (1-based, increments per re-attempt on the same plan)
- `provider`, `modelId`, `promptVersion`
- `sourceAssessmentId`, `sourceResultId`, `definitionVersion`, `libraryVersion`, `disclaimerVersion`
- `status` (`generationStatus` of this attempt): `PENDING | GENERATING | READY | FAILED`
- `validationOutcome`: `VALID | INVALID` (+ sanitized reasons; no content)
- `retryCount`, `tokenUsage { prompt, completion, total }`, `latencyMs`
- `startedAt`, **`deadlineAt`** (lease expiry for **this** attempt — `startedAt + lease`; the attempt is stale once `now() > deadlineAt`), `finishedAt`
- `errorCode` (sanitized, no content; e.g. `TIMEOUT`/`STALE` for reclaimed attempts)

The parent **`CoachingPlan`** row also carries the **lease metadata for the in-flight attempt** (research D18): **`generationStartedAt`** + **`generationDeadlineAt`** (the configured lease, copied from the claimed attempt) and a **`currentAttemptId`** reference (nullable) to the `CoachingPlanGeneration` row being worked. `currentAttemptId` is the guard for late-result safety (research D18): a worker persists its result only via a conditional update guarded on `generationStatus = 'GENERATING' AND currentAttemptId = :thisAttemptId`; if a newer attempt has been claimed (or the plan is already `READY`), `currentAttemptId` no longer matches → the late result updates zero rows and is discarded.

**Exclusions**: **NO chain-of-thought. NO raw assessment content. NO plan copy.** References + operational metadata only. This satisfies Constitution VI/VII (privacy) and makes generation auditable without retaining sensitive or provider-internal data.

**One row per attempt; retry creates a new row**: a re-attempt on a `generationStatus = FAILED` plan (research D13/D18) transitions `generationStatus: FAILED → PENDING` on the **same** `CoachingPlan` row and creates a **new** `CoachingPlanGeneration` row with `attempt = prev + 1`; the prior `FAILED`/reclaimed attempt row is retained (immutable) for audit. A retry **never mutates a prior attempt row** and **never creates a new `CoachingPlan` row**. Deletion cascades with `CoachingPlan` (research D10).

**Rationale**: Constitution III (auditability) + IV (deterministic governance) + VI/VII (privacy) require a reproducible, auditable record of each generation without persisting sensitive content or CoT. Pinning `provider`/`modelId`/`promptVersion`/source ids on each attempt makes a historical plan's generation fully reconstructable in principle (given the same pinned artifacts), even though the LLM output itself is non-deterministic. Token/latency/cost fields support cost controls and observability (research D14). The per-attempt `deadlineAt` and the parent-plan lease metadata + `currentAttemptId` are what make the in-process async-execution model operationally safe (research D18): they bound the attempt, make stale/restart recovery lazy, and prevent a late result from an expired attempt from overwriting a newer successful attempt.

**Alternatives considered**:
- **Persist CoT/raw output** — violates Constitution VI/VII and the no-CoT rule; rejected.
- **One row per plan (overwrite on re-attempt)** — loses audit history of attempts; rejected.
- **No `deadlineAt` / no lease metadata / no `currentAttemptId`** — leaves no way to detect stale attempts, recover from process restart, or guard against late results overwriting a newer success; rejected (research D18).
- **No generation metadata** — makes generation unauditable and non-reproducible-in-principle; rejected (Constitution III).
- **A separate audit module** — no module home for cross-cutting audit; the owning module (Coaching) records its own generation metadata; rejected.

---

## D17 — Two independent statuses: GenerationStatus vs PlanStatus

**Decision**: The single 6-value `CoachingPlanStatus` enum (`PENDING | GENERATING | PROPOSED | ACTIVE | COMPLETED | FAILED`) is **split into two independent enums** persisted on `CoachingPlan`:

- **`generationStatus`** (`PENDING | GENERATING | READY | FAILED`; default `PENDING`) — the progress of the **current** generation attempt. A column on `CoachingPlan` **and** on each `CoachingPlanGeneration` attempt row (research D16).
- **`planStatus`** (`PROPOSED | ACTIVE | COMPLETED`; **nullable** — default null, set only when generation succeeds) — the plan lifecycle. A column on `CoachingPlan` only.

The two are **independent**: a plan has no usable lifecycle/content until `generationStatus = READY`. **Successful validated generation transitions `generationStatus → READY` and `planStatus → PROPOSED` atomically** (one transaction; research D15). After that, the lifecycle proceeds on `planStatus` alone:

- **Explicit acceptance** transitions **only** `planStatus: PROPOSED → ACTIVE` (`POST /coaching/plan/accept`; Constitution IV); it does **not** change `generationStatus`.
- **Action completion** transitions **only** `planStatus: ACTIVE ⇄ COMPLETED` (auto-driven by action progress; research D9); it does **not** change `generationStatus`.
- **Provider/validation failure** transitions `generationStatus → FAILED` (FAILED is a **GenerationStatus, never a PlanStatus**); `planStatus` **stays null** and no usable content is persisted.
- **Retry** transitions `generationStatus: FAILED → PENDING` on the **same current `CoachingPlan` record** and creates a **new** `CoachingPlanGeneration` attempt row (research D13/D16/D18); `planStatus` is still null and is unaffected.
- **UI locale change** transitions **neither** status and never invokes generation (the plan is always bilingual; research D11).

**Rationale**: Generation progress (`PENDING → GENERATING → READY`, or `→ FAILED`) and plan lifecycle (`PROPOSED → ACTIVE ⇄ COMPLETED`) are **independent concepts** — a plan can be generating, ready-but-unaccepted, active, completed, or failed-generation independently of its lifecycle stage, and `FAILED` is a generation outcome, not a lifecycle. Encoding them in a single 6-value enum conflates two orthogonal axes: it makes `FAILED` a lifecycle state (it is not — a failed plan has no lifecycle), forces a single column to encode both "is it being generated?" and "where is it in its lifecycle?", and breaks the invariant that the lifecycle only starts after successful generation. Two independent columns (with `planStatus` nullable until `READY`) make the invariant structural: a null `planStatus` *is* "no usable plan yet"; a non-null `planStatus` *only ever* appears with `generationStatus = READY`. This keeps acceptance and the action lifecycle touching only `planStatus`, retry touching only `generationStatus` (+ a new attempt), and a locale switch touching neither. (References: A4, A5, A14, A18; FR-006c/FR-006d/FR-006f.)

**Alternatives considered**:
- **The prior single 6-value `status` enum** — conflates two independent concepts; `FAILED` becomes a lifecycle state; a single column cannot express "no lifecycle until generation succeeds"; rejected.
- **A single enum plus a separate `hasContent` boolean** — still conflates the axes and adds a redundant column that must be kept in sync with the enum; rejected.
- **`planStatus` non-nullable with a `DRAFT`/`NONE` initial value** — introduces a third lifecycle value with no product meaning; null-until-`READY` is the simplest expression of "no lifecycle yet"; rejected.
- **Collapse `READY` into `PROPOSED` (one status, set on success)** — loses the distinction between "generation succeeded" and "lifecycle stage = proposed" and makes retry/acceptance logic branch on the same column; rejected.

---

## D18 — Operationally-safe in-process async execution (lease + reclaim; no fire-and-forget)

**Decision**: The MVP keeps async start + poll without Redis or a job queue (research D13), but generation **MUST NOT** rely on an untracked fire-and-forget Promise after the HTTP response. The execution model is **tracked, lease-bounded, and reclaimable**:

- **Atomic generation claim**: the `PENDING → GENERATING` transition is a **single conditional update** — `UPDATE CoachingPlan SET generationStatus='GENERATING', generationStartedAt=now(), generationDeadlineAt=now()+lease, currentAttemptId=:attemptId WHERE id=:planId AND generationStatus='PENDING'`. Only one worker/request can succeed, so **simultaneous retries/claims never start duplicate provider calls** (FR-006f, AC-X13, SC-017).
- **Tracked in-process runner**: a singleton generation runner (owned by the Coaching module) holds a **registry of in-flight attempts** (by `planId`/`currentAttemptId`) with their `AbortSignal`s, so the work is observable and cancelable — **not an untracked Promise**. The runner is triggered by `POST` (start) and by `GET`/`POST` reclaim when a stale `GENERATING` attempt is detected.
- **Lease metadata**: each in-flight attempt has `generationStartedAt` + `generationDeadlineAt` on `CoachingPlan` and `deadlineAt` on the `CoachingPlanGeneration` row (research D16). An attempt is considered **stale once `now() > generationDeadlineAt`**. The lease duration is a deferred operational decision (config-driven at deploy time — spec §15).
- **Stale recovery (incl. process restart)**: on `GET`/`POST`, if `generationStatus = 'GENERATING'` and `now() > generationDeadlineAt`, the attempt is **reclaimed** — the stale `CoachingPlanGeneration` attempt row is marked `FAILED` with a sanitized `TIMEOUT`/`STALE` error code, `generationStatus` returns to `PENDING`, and a new claim can proceed (the user polls again or a retry starts a new attempt). This also recovers from **process restart**: in-flight tracked promises are lost on restart, but the plan row remains `GENERATING` with a deadline; the next `GET`/`POST` after the deadline reclaims it. No manual intervention is required.
- **Retry on the same row**: a `POST` while `generationStatus = FAILED` (or a reclaim) transitions `generationStatus: FAILED → PENDING` on the **same current plan record** and creates a **new** `CoachingPlanGeneration` attempt row; the worker then claims it via the atomic `PENDING → GENERATING` update. **No new `CoachingPlan` row is created for a retry** (research D13/D16).
- **Late-result guard**: when a worker finishes an attempt (success or failure), it persists only via a conditional update guarded on `generationStatus = 'GENERATING' AND currentAttemptId = :thisAttemptId`. If a newer attempt has already been claimed (or the plan is already `READY`/`PROPOSED`), `currentAttemptId` no longer matches → the late result updates **zero rows** and is **discarded**. **A late success from an expired attempt can never overwrite a newer successful attempt.**
- **Provider timeout**: handled per the adapter config (research D14; FR-006a); on timeout the attempt transitions `generationStatus → FAILED` (treated as a reclaimable failure) and a retry creates a new attempt.
- **Duplicate POST**: returns the **same plan** and **never duplicates an active provider call** — if `generationStatus` is already `GENERATING` (lease alive), `POST` returns `202` and starts nothing; if `READY`, returns the resource without a provider call; if `PENDING`, the atomic claim ensures at most one call; if `FAILED`, triggers a retry (above).
- **Runtime prerequisite**: this in-process model requires the API process to be a **long-running containerized NestJS service** (the deployment per plan.md) so the tracked runner survives between the `202` response and attempt completion. If the deployment were serverless or scaled the API process to zero between requests, the in-process runner could not survive and the **execution-trigger mechanism would be NEEDS CLARIFICATION** (it would require a real queue such as Redis/BullMQ, which is out of the approved MVP scope). Under the current long-running container deployment this is **not a blocker**; it is recorded as a deployment prerequisite to verify before launch (spec §15).

**Rationale**: Constitution XII forbids speculative infrastructure (no Redis/job queue for MVP), but an untracked fire-and-forget Promise after the `202` response would be unsafe: a lost worker (process restart), a long provider call, or a simultaneous retry could orphan a `GENERATING` attempt, duplicate a provider call, or let a late result overwrite a newer success. The atomic claim (only one claimant), the lease (bounded staleness), the tracked runner (observable/cancelable, not fire-and-forget), stale/restart reclaim (lazy recovery to `PENDING`), and the `currentAttemptId` late-result guard (a late result cannot overwrite a newer success) together make the in-process model operationally safe without any new infrastructure. The long-running-container prerequisite is explicit so a future serverless move is flagged rather than silently broken. (References: A18, FR-006f, AC-X13, SC-017.)

**Alternatives considered**:
- **Untracked fire-and-forget Promise after `202`** — orphaned attempts on restart/process loss, duplicate provider calls on simultaneous retry, late results overwriting newer successes; rejected as operationally unsafe.
- **Redis/BullMQ job queue** — would solve the safety problem but is premature infrastructure for a modular monolith (Constitution XII); rejected for MVP; would become the NEEDS CLARIFICATION fallback only if the deployment goes serverless.
- **Synchronous generation on POST (no async)** — long latency, poor UX, client-timeout risk; rejected (research D13).
- **No lease (`generationDeadlineAt`)** — no way to detect a stale/restart-orphaned `GENERATING` attempt; manual intervention would be required; rejected.
- **No `currentAttemptId` late-result guard** — a late success from an expired attempt could overwrite a newer successful attempt; rejected.
- **Per-retry new `CoachingPlan` row** — violates one-current-plan-per-user and complicates retake/history (research D7/D13); rejected in favor of retry on the same row + new attempt.

---

## Summary of NEEDS CLARIFICATION resolution

All technical unknowns are resolved above (D1–D18). The architecture's resolved decisions now include the **two-status model** (`generationStatus` `PENDING|GENERATING|READY|FAILED` independent of `planStatus` `PROPOSED|ACTIVE|COMPLETED`, null until `READY` — D13/D17) and **lease-based in-process async execution** (atomic claim + tracked runner + lease + stale/restart reclaim + late-result guard on `currentAttemptId` — D18). The resolved decisions are verified by the spec's acceptance and success criteria across the full range **AC-X1..AC-X13** and **SC-001..SC-017** (the two-status lifecycle, generation auditability, and async-execution safety extend the range to AC-X10..X13 / SC-013..SC-017). No `[NEEDS CLARIFICATION]` markers remain. Remaining gates are **external launch gates**, not planning clarifications (see plan.md Reference Alignment and spec §16):

1. **Clinical/safety reviewer approval** of the `CoachingActionLibrary` content (focus-area reasons, goals, action steps) for every producible focus area, in both languages (spec §16; FR-010a).
2. **Legal/privacy reviewer approval** of the coaching-scope disclaimer text and the plan-data retention/deletion behavior in both languages, per launch jurisdiction (spec §16; FR-016/FR-040).
3. **Prompt-template review** (Constitution III) — the versioned prompt templates must be clinically/safety/privacy reviewed before activation; `promptVersion` is pinned on each generation.
4. **Provider data-retention/training policy review** (Constitution VI/VII) — the selected LLM provider's data retention and model-training policies must be reviewed and documented before production; this is a hard launch gate. No chain-of-thought or raw assessment content is sent to or persisted from the provider.

**Open decisions (flagged, not blocking planning)**:
- **Free-text-to-LLM**: `goalFreeText` is **excluded** from the grounding bundle by default (privacy conservative). Reversing this to feed user free-text into generation is an open privacy decision requiring Constitution VI/VII review.
- **Specific provider/model**: config-driven, selected at deploy time (`COACHING_LLM_PROVIDER`/`COACHING_LLM_MODEL`); not fixed in this research.
- **Cost/rate-limit budgets**: per-user/per-tenant rate limit, token-budget cap, and latency/cost telemetry are wired (research D14/D16); specific budgets are set at deploy/config time.
- **Generation lease duration**: `generationDeadlineAt = generationStartedAt + lease` (research D16/D18); the specific lease duration is a deferred operational decision, config-driven at deploy time (spec §15).
- **Long-running-container runtime prerequisite**: the in-process async-execution model (research D18; A18/FR-006f) requires the API process to be a **long-running containerized NestJS service** so the tracked generation runner survives between the `202` response and attempt completion. Under the current deployment (per plan.md) this is satisfied and **not** a blocker. **If** the deployment were serverless or scaled the API process to zero between requests, the in-process runner could not survive and the **execution-trigger mechanism would be NEEDS CLARIFICATION** (it would require a real queue such as Redis/BullMQ, which is out of the approved MVP scope). This is a deployment prerequisite to verify before launch, not a planning ambiguity (spec §15).
- **DISTRESS post-generation clinical review**: DISTRESS-eligible users receive a bounded, supportive-framing plan (instructions enforced); whether a human clinical review step is required for DISTRESS plans before `PROPOSED` (i.e. before `planStatus` is set) is an open decision.
- **Therapeutic-claims scope**: the exact boundary of permissible therapeutic-framing language in synthesized copy (vs. clinical claims) is finalized in prompt-template review (launch gate 3) and enforced by the validator (research D15).

The seed ships approved-for-planning v1.0 content; the feature fails closed (`503 PLAN_UNAVAILABLE`/`FAILED`) if a producible focus area's library entry is missing, grounding is corrupt/unapproved, the provider fails, output is malformed, or validation/concerning-output detection rejects. The implementation does not invent clinical/unsupported content (Constitution I/III).

Proceed to Phase 1 (data-model.md, contracts/coaching-plan.md, quickstart.md).