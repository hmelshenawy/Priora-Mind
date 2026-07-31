# Data Model — 001-user-onboarding-and-assessment

**Phase**: 1 (Design & Contracts)
**Date**: 2026-07-29
**Storage**: PostgreSQL via Prisma (research D1). One owner per entity per SAD §5 / ADR-006.
**Convention**: `id` = UUID v4 (or cuid); all timestamps UTC `timestamptz`. Every user-owned row carries `user_id` and is isolated by backend authorization (FR-027..FR-029). Sensitive columns are **never** selected into logs/traces (research D7).

Stable product entities are defined in spec §9; this document defines their persisted shape, validation, state machines, indexes, and migrations.

---

## Entity ownership summary

| Entity | Owner module | Source |
|---|---|---|
| UserAccount | Auth | SAD §5 |
| VerificationToken | Auth | SAD §5 |
| RefreshToken | Auth | SAD §5 |
| ConsentRecord | Auth | SAD ADR-006 |
| Profile | Profile | SAD §5 |
| Preferences | Profile | SAD §5 |
| OnboardingState | Profile | SAD ADR-006 |
| Assessment | Assessment | SAD §5 |
| AssessmentAnswer | Assessment | SAD §5 |
| AssessmentResult | Assessment | SAD §5 |
| SafetyEvaluation | Safety | SAD ADR-006 |
| AssessmentDefinition (reference) | Assessment | Assessment_Specification §11 |
| SafetyDefinition / SafetyCopy (reference) | Safety | Safety_Decision_Matrix |
| NoticeVersionSet / ConsentContent (reference) | Auth | Consent policy §6 |
| EmergencyResource (reference) | Safety | Safety Matrix §8 |
| DeletionLog | Retention (platform) | Consent policy §8/§9 |

Reference/definition rows are versioned, immutable content (research D5), not user-owned. `DeletionLog` is a platform-owned operational record (sanitized counters only). The Auth-owned `EmailPort` (research D2) is a **port/interface, not a table** — it has no persisted entity; its production adapter integrates an external transactional email provider via configuration, and a fake adapter is used in dev/test.

---

## 1. UserAccount (Auth)

| Field | Type | Notes / validation |
|---|---|---|
| id | uuid pk | |
| email | citext, unique | lowercased; never disclosed in errors (FR-004) |
| password_hash | argon2id string | never selected into responses/logs |
| status | enum | `REGISTERED`, `EMAIL_VERIFIED` (spec §9) |
| created_at | timestamptz | |
| last_activity_at | timestamptz | drives unverified-account + pre-consent retention (Consent §8) |
| deleted_at | timestamptz nullable | soft marker only; hard delete via platform flow (FR-031) |

**State machine**: `REGISTERED → EMAIL_VERIFIED` on valid verification link (FR-002). No other transitions in this feature.

**Indexes**: unique(`email`) where `deleted_at IS NULL`; index(`status`).

**Validation**: email format + uniqueness (anti-enumeration: duplicate-email returns the same response as success — FR-004); password complexity per Auth policy (no value echoed).

---

## 2. VerificationToken (Auth)

| Field | Type | Notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk → UserAccount | |
| token_hash | bytes | store **hash** only; raw token sent by email (research D2) |
| expires_at | timestamptz | short TTL |
| consumed_at | timestamptz nullable | single-use; set on verification |
| created_at | timestamptz | |

**Rules**: one valid (unconsumed, unexpired) token per user at a time; re-send rotates it. Unique(`user_id`, `consumed_at IS NULL`).

---

## 3. RefreshToken (Auth)

| Field | Type | Notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk | |
| token_hash | bytes | hashed refresh token |
| expires_at | timestamptz | |
| revoked_at | timestamptz nullable | rotation revokes previous |
| created_at | timestamptz | |

**Rules**: rotating refresh revokes the prior token; supports logout and forced rotation. SAD §13.

---

## 4. ConsentRecord (Auth)

| Field | Type | Notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk | |
| service_boundary_version | string | immutable notice version id (Consent §6) |
| terms_version | string | |
| privacy_notice_version | string | |
| consent_language_code | char(2) | `ar`/`en` — language the user consented in (Consent §5) |
| product_channel_id | string | product/channel identifier (Consent §5) |
| granted_at | timestamptz | |
| created_at | timestamptz | |

**Constraints**: MUST NOT contain assessment/safety answers, inferred state, or copied notice text (Consent §5). Unique on a *granted* record for `(user_id, service_boundary_version, terms_version, privacy_notice_version)` → idempotent retry returns existing (research D6, Consent §12). Notice versions cannot be undetermined → fail closed, no record written (FR-007).

**Re-consent**: a material version change requires a new `REQUESTED → GRANTED` cycle; superseded records retained for audit (Consent §8).

---

## 5. Profile (Profile)

| Field | Type | Notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk unique | 1:1 with user |
| created_at | timestamptz | created once consent granted (FR-009) |
| updated_at | timestamptz | |

> Profile holds identity metadata; only language + timezone are collected in this feature (FR-009). Additional attributes belong to future features.

## 6. Preferences (Profile)

| Field | Type | Notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk unique | |
| language_code | char(2) | `ar`/`en`; drives RTL/LTR + localization (FR-010) |
| timezone | string | IANA tz; validated against tz database (FR-009) |
| updated_at | timestamptz | |

**Validation**: language ∈ {ar, en}; timezone is a known IANA name. Changing language updates direction without losing progress (FR-011).

---

## 7. OnboardingState (Profile)

| Field | Type | Notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk unique | one onboarding state per user (spec A4) |
| state | enum | `NOT_STARTED`, `IN_PROGRESS`, `ASSESSMENT_PENDING`, `ASSESSMENT_IN_PROGRESS`, `ASSESSMENT_SUBMITTED`, `COMPLETED`, `SAFETY_HOLD` (spec §9) |
| current_step | string nullable | the unfinished step the user resumes at (FR-033, US8) |
| updated_at | timestamptz | |
| last_activity_at | timestamptz | drives incomplete-onboarding retention (Consent §8) |

**State machine** (spec §9):
```
NOT_STARTED → IN_PROGRESS            (consent granted)
IN_PROGRESS → ASSESSMENT_PENDING      (profile saved)
ASSESSMENT_PENDING → ASSESSMENT_IN_PROGRESS  (assessment opened)
ASSESSMENT_IN_PROGRESS → SAFETY_HOLD   (HIGH_RISK or CRISIS)
SAFETY_HOLD → ASSESSMENT_IN_PROGRESS   (user-initiated re-entry; new SafetyEvaluation NORMAL/DISTRESS)
ASSESSMENT_IN_PROGRESS → ASSESSMENT_SUBMITTED  (final submit, safety NORMAL/DISTRESS)
ASSESSMENT_SUBMITTED → COMPLETED       (result presented)
```
**Invariants**: `SAFETY_HOLD` blocks `COMPLETED` and suppresses the normal result (FR-019b, Safety §6). Re-entry creates a **new** SafetyEvaluation and never edits history (research D9). Completed users bypass onboarding (FR-033, US9).

**Concurrency**: state transitions are conditional updates (`UPDATE ... WHERE state = :expected`) to prevent lost updates across tabs (Spec §7).

---

## 8. Assessment (Assessment)

| Field | Type | Notes |
|---|---|---|
| id | uuid pk | the active assessment; one per user (FR-018a) |
| user_id | uuid fk unique | enforces "one active initial assessment" |
| definition_version | string | pinned AssessmentDefinition version (research D5) |
| state | enum | `NOT_STARTED`, `IN_PROGRESS`, `SUSPENDED`, `SUBMITTED`, `SCORED` (spec §9) |
| started_at | timestamptz nullable | |
| submitted_at | timestamptz nullable | set on the single accepted submit |
| last_activity_at | timestamptz | drives incomplete-assessment retention (Consent §8) |
| created_at | timestamptz | |

**State machine** (spec §9):
```
NOT_STARTED → IN_PROGRESS         (first answer saved)
IN_PROGRESS → SUSPENDED            (HIGH_RISK; saved answers retained, resumable)
SUSPENDED → IN_PROGRESS            (user-initiated re-entry after NORMAL/DISTRESS eval)
IN_PROGRESS → SUBMITTED            (final submit; conditional update — idempotent, research D6)
SUBMITTED → SCORED                  (scoring + final safety eval NORMAL/DISTRESS)
```
**CRISIS**: Assessment is interrupted (does not reach `SUBMITTED`); onboarding → `SAFETY_HOLD` (Safety Matrix §6). Restart clears saved answers on the **same** row (overwrites, not a new row — FR-014b, Assessment §10).

**Idempotency**: the submit transition is a conditional update on `state IN ('IN_PROGRESS','SUSPENDED')`; a duplicate/concurrent submit returns the existing `SCORED` result (FR-015, FR-034, AC-X4, research D6). Unique(`user_id`) enforces one active assessment.

---

## 9. AssessmentAnswer (Assessment)

| Field | Type | Notes |
|---|---|---|
| id | uuid pk | |
| assessment_id | uuid fk | |
| question_id | string | e.g. `AS-01`, `AG-01`, `SQ-01` (Assessment_Specification / Safety Matrix) |
| question_kind | enum | `current_state`, `goal_select`, `goal_rank`, `goal_free_text`, `safety` |
| value | string/jsonb | typed by kind (scale 0–4 / domain codes / ranking / free text / `S0..SX`,`D0..DX`) |
| updated_at | timestamptz | |

**Constraints**: unique(`assessment_id`, `question_id`) → per-answer upsert is idempotent (FR-014, research D6). Required-question completeness enforced on submit (FR-014a): all 16 current-state + AG-01/02/03; AG-04/05 optional; **SQ-01 required** (codes S0/S1/S2/SX), **SQ-02 conditionally required** when SQ-01 ∈ {S1,S2,SX} (codes D0/D1/DX), and **SQ-03 required** (codes F0/F1/F2/FX) (Safety §3). Free-text answers are subject to safety evaluation and MUST NOT be used to infer a diagnosis (Assessment §6). All three safety questions are unscored and separate from domain scores (Safety §2).

**Sensitive**: `value` is never selected into logs/analytics (FR-030). Free-text columns are the highest-sensitivity payload and are excluded from all telemetry (research D7).

---

## 10. AssessmentResult (Assessment)

| Field | Type | Notes |
|---|---|---|
| id | uuid pk | |
| assessment_id | uuid fk unique | 1:1 → exactly one result (FR-015) |
| user_id | uuid fk | for isolation queries |
| definition_version | string | pinned scoring version (research D5) |
| domain_scores | jsonb | `{domain: {score, band, label_en, label_ar}}` for all 8 domains (FR-016) |
| strongest_domain | string | presentation (Assessment §9) |
| support_domain | string | domain most in need of support |
| selected_priorities | jsonb | AG-01/02 (domains + ranks), preserved separately (FR-016, Assessment §9) |
| goal_free_text | jsonb nullable | AG-03/04/05 captured per selected domain |
| safety_evaluation_id | uuid fk → SafetyEvaluation | the final evaluation that gated this result |
| created_at | timestamptz | |

**Constraints**: immutable after creation (FR-018a, Assessment §10). No `overall_score` field (FR-016). Bands are coaching labels, NOT safety levels (FR-018). Not revisitable/retakeable through this feature after `COMPLETED` (FR-018a).

**Suppression**: no `AssessmentResult` is presented while `OnboardingState = SAFETY_HOLD` (FR-019b, Assessment §9).

---

## 11. SafetyEvaluation (Safety)

| Field | Type | Notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk | |
| assessment_id | uuid fk nullable | the assessment context (if triggered from assessment) |
| definition_version | string | pinned SafetyDefinition/SafetyCopy version (research D5) |
| level | enum | `NORMAL`, `DISTRESS`, `HIGH_RISK`, `CRISIS` (explicit states, FR-019) |
| reasons | string[] | which rules fired (auditable; non-sensitive tags only) |
| trigger_context | enum | `per_answer`, `on_submit`, `re_entry` (FR-019a) |
| is_current | boolean | latest completed drives current routing; older rows `false` (research D9) |
| evaluated_at | timestamptz | append-only ordering fallback for "latest" |
| created_at | timestamptz | |

**Constraints**: **immutable, append-only** — never updated or deleted except by account deletion (FR-031, Safety §9). Historical rows retained and never relabeled; only `is_current` flips (research D9). The classification is **independent** of `AssessmentResult.domain_scores` except for the DISTRESS pattern (≥3 domains <25 OR Mood <25 — Safety §5), which the classifier reads as input, not from the result row. DISTRESS is also produced directly by SQ-03=F2 (Safety §5); SQ-03 never produces HIGH_RISK/CRISIS and never downgrades a HIGH_RISK/CRISIS classification from SQ-01/SQ-02.

**Highest-risk-wins**: conflicting/stale signals resolve to the highest level; client state cannot downgrade a server classification; a duplicate/stale request cannot downgrade (Safety §10). The `safety_evaluation_id` on `AssessmentResult` references the final `on_submit`/`re_entry` evaluation that permitted completion.

---

## 12. Reference/definition tables (versioned content)

These hold the approved bilingual content from the product docs (research D5). Immutable once published; new versions are new rows.

- **AssessmentDefinition** (Assessment): `version`, `questions` (id/domain/polarity/scale/required/EN/AR), `goal_structure`, `scoring_formula_version`, `band_thresholds`, `band_labels_en/ar`. Source: Assessment_Specification v1.0.
- **SafetyDefinition** (Safety): `version`, `sq_questions` (SQ-01/SQ-02/SQ-03 + option codes S/D/F + EN/AR), `classification_matrix_version`. Source: Safety_Decision_Matrix v1.0. Includes the SQ-03 rule: SQ-03 classifies DISTRESS only and never downgrades HIGH_RISK/CRISIS from SQ-01/SQ-02.
- **SafetyCopy** (Safety): `version`, `level` (DISTRESS/HIGH_RISK/CRISIS/unavailable), `copy_en`, `copy_ar`. The exact approved deterministic copy (Safety Matrix §7).
- **NoticeVersionSet** (Auth): `service_boundary_version`, `terms_version`, `privacy_notice_version`, `boundary_text_en/ar`, `links`. Source: Consent_and_Data_Retention_Policy §3.
- **EmergencyResource** (Safety): `version`, `country_code` nullable, `resource_en/ar`, `approved`, `approved_at`. Only approved rows are ever displayed; missing/unverified → generic local-emergency fallback (Safety §8).

**Rules**: completed user records pin the `*_version` they were produced under; historical results are never silently recalculated (Assessment §11).

---

## 13. DeletionLog (Retention — platform)

Operational record of the scheduled retention-cleanup job and the user-initiated deletion flow (research D10). **Sanitized counters only — no user content** (FR-030, Consent §8).

| Field | Type | Notes |
|---|---|---|
| id | uuid pk | |
| run_kind | enum | `scheduled_retention`, `account_deletion` |
| window_start | timestamptz | the inactivity window evaluated (scheduled) or the deletion request time (account) |
| window_end | timestamptz | |
| category_counts | jsonb | `{ auth, profile, assessment, safety, consent }` each `{ deleted, errors }` — integers only |
| error_summary | string nullable | non-sensitive error tag (e.g. `db_unreachable`); never user content |
| status | enum | `completed`, `partial`, `failed` |
| confirmation_id | string | non-sensitive identifier (Consent §8 operational deletion record) |
| created_at | timestamptz | |

**Constraints**: no column may hold email, answers, scores, safety answers/levels, or consent contents. Retained 30d (Consent §8). The `confirmation_id` is the idempotency marker for a run window.

---

## 14. Scheduled retention-cleanup (Retention module)

A platform **RetentionModule** owns a daily `@Cron` job (research D10) that hard-deletes expired rows per Consent policy §8 through per-module **deletion contracts** (no cross-module direct table access — SAD §5 / ADR-005):

- `AuthDeletionPort.deleteExpired(cutoffs)` — unverified accounts (7d), verified pre-consent accounts (30d inactivity), retention-expired/superseded consent records.
- `ProfileDeletionPort.deleteExpired(cutoffs)` — onboarding state + profile/preferences with no surviving activity.
- `AssessmentDeletionPort.deleteExpired(cutoffs)` — incomplete assessment answers + dangling incomplete assessments (30d inactivity); completed results retained while the account exists.
- `SafetyDeletionPort.deleteExpired(cutoffs)` — safety answers/evaluations tied to deleted accounts/assessations.

**Determinism & idempotency**: each deletion is `DELETE ... WHERE last_activity_at < :cutoff` (or `created_at < :cutoff` for unverified accounts). Re-running is a no-op on already-deleted rows; no row is deleted twice. Deletion order respects referential integrity (answers → assessment → onboarding → profile → consent → account).

**Failure handling**: each category runs in its own transaction; a failure in one does not block the others. Per-record errors are caught and counted; failed rows retry on the next run. Whole-job failure (e.g. DB unreachable) simply re-runs next tick — slightly-longer retention is safe; the cutoff predicate prevents the only unsafe outcome (premature deletion). User-initiated account deletion (Consent §9) reuses the same per-module contracts: idempotent, authenticated, blocks new processing on acceptance, and does not report completion until all in-scope stores confirm.

**Observability**: emits only `{ window, category, deleted_count, error_count, run_ms }` to logs/metrics and writes one `DeletionLog` row. No user content ever logged (research D7). A unit/integration test asserts the captured log/trace contains no sensitive payload.

> `EmailPort` is Auth-owned and not persisted (research D2); it has no entity in this data model.

```
UserAccount 1—1 Profile
UserAccount 1—1 Preferences
UserAccount 1—1 OnboardingState
UserAccount 1—* ConsentRecord            (append-only; latest granted drives access)
UserAccount 1—* VerificationToken (active 1)
UserAccount 1—* RefreshToken   (active 1 per session family)
UserAccount 1—1 Assessment               (one active initial assessment)
Assessment 1—* AssessmentAnswer          (unique per question_id)
Assessment 1—1 AssessmentResult          (created on SCORED)
Assessment 1—* SafetyEvaluation          (append-only; one is_current)
AssessmentResult *—1 SafetyEvaluation    (final gating eval)
SafetyEvaluation *—1 SafetyDefinition / SafetyCopy (version pin)
Assessment *—1 AssessmentDefinition      (version pin)
ConsentRecord *—1 NoticeVersionSet       (version pin)
```

No cross-module direct table access; modules communicate via services/contracts (SAD §11). Safety persists its own rows; Assessment references a SafetyEvaluation by id only.

---

## Validation rules (cross-cutting)

- Email verification required before advancing past consent (FR-002, A5): enforced in OnboardingService guard.
- Consent required before profile/assessment collection (FR-006, Consent §2): OnboardingService guard.
- Notice-version mismatch → re-consent, fail closed (FR-007/FR-008, Consent §6).
- Required-answer completeness on submit (FR-014a, Assessment §10).
- SQ-02 conditionally required when SQ-01 ∈ {S1,S2,SX}; SQ-03 required (Safety §3). SQ-03 → DISTRESS only; never downgrades HIGH_RISK/CRISIS (Safety §5).
- One active assessment per user (FR-018a): DB unique(`user_id`) on Assessment.
- Idempotent submit (FR-015): conditional state update + unique result on `assessment_id`.
- Anti-enumeration on register/login (FR-004): identical responses.
- Authorization: every read/write filters by `user_id` server-side (FR-028/FR-029); route guards UX only.

---

## Migrations

Forward-only, reviewable Prisma migrations (research D1). Suggested order:

1. **m_init_auth**: `UserAccount`, `VerificationToken`, `RefreshToken`, enums (`account_status`).
2. **m_consent**: `ConsentRecord`, `NoticeVersionSet` (seed v1.0).
3. **m_profile**: `Profile`, `Preferences`, `OnboardingState` + enum (`onboarding_state`).
4. **m_assessment_def**: `AssessmentDefinition` (seed Assessment_Specification v1.0).
5. **m_assessment**: `Assessment` + enum (`assessment_state`), `AssessmentAnswer` + enum (`question_kind`), `AssessmentResult`.
6. **m_safety_def**: `SafetyDefinition`, `SafetyCopy`, `EmergencyResource` (seed Safety Matrix v1.0; no unapproved resources).
7. **m_safety**: `SafetyEvaluation` + enum (`safety_level`, `trigger_context`).
8. **m_retention**: `DeletionLog` + enum (`run_kind`, `retention_status`); indexes for the inactivity cutoffs on `UserAccount.last_activity_at`, `OnboardingState.last_activity_at`, `Assessment.last_activity_at` to support the scheduled cleanup job (research D10).

**Seed (data migrations)**: the versioned reference content (AssessmentDefinition, SafetyDefinition, SafetyCopy, NoticeVersionSet) is seeded from the product docs at their v1.0 content. This content is approved-for-planning; **final Terms/Privacy Notice text and country resources are launch-gated** (research §summary; Consent §15; Safety §13) and ship empty/placeholder until approved.

**Rollback**: migrations are forward-only; reference-content versions are immutable (never altered in place). Account deletion removes user rows; reference/definition rows are platform-managed.

---

## 300-line note (Constitution VIII)

No single handwritten source file is expected to exceed 300 lines:
- `safety-classifier.ts` — pure function + small matrix; well under 300.
- `scoring.service.ts` — pure deterministic scoring; under 300.
- `assessment.service.ts` — may approach the limit due to lifecycle + submit + idempotency; **planned split**: `assessment-lifecycle.service.ts` (save/resume/restart) and `assessment-submit.service.ts` (submit/score/result), flagged in tasks.
- `redact.ts`, content loaders — small.
- Migrations and seed fixtures are **exempt** (Constitution VIII: migrations, fixtures, declarative schema).

Files flagged for the 300-line review are recorded in tasks.md (Phase 2).