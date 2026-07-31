# Research — 001-user-onboarding-and-assessment

**Phase**: 0 (Technical decisions resolving unknowns)
**Date**: 2026-07-29
**Status**: All NEEDS CLARIFICATION resolved. Product content (questions, copy, retention periods, notice wording) is supplied by the three authoritative product docs and is **not** a research decision; this file resolves only **technical** choices.

Format per decision: **Decision / Rationale / Alternatives considered**. Each decision maps to the FRs/acceptance it unblocks.

---

## D1 — ORM and migration tool

**Decision**: Prisma as the NestJS data-access ORM with Prisma Migrate for versioned, reviewable SQL migrations committed to the repo.

**Rationale**: SAD §3 mandates PostgreSQL. Prisma provides a typed schema source-of-truth, migrations that can be code-reviewed (Constitution XI — docs/impl sync), and transactional support for the idempotent submit path (FR-015) and SAFETY_HOLD state transitions (FR-019b). Schema is split per module so module ownership (SAD §5 / ADR-005) stays readable. Prisma's generated client keeps controllers free of hand-written SQL (Constitution VIII).

**Alternatives considered**:
- **TypeORM** — mature with NestJS, but less strict typing and weaker migration review ergonomics.
- **raw `pg` + hand-written queries /Repository pattern** — maximum control, but more boilerplate and higher risk of cross-module data leakage; rejected as premature (Constitution XII). Could be revisited per-module if a hot path is measured.
- **Drizzle** — good DX and SQL-first, but smaller ecosystem and weaker NestJS integration today; revisit if Prisma becomes a bottleneck.

---

## D2 — Outbound email for verification (EmailPort)

**Decision**: An `EmailPort` interface **owned by the Auth module** (`auth/ports/email.port.ts`), with two concrete adapters selected by configuration:
- **Production adapter** (`HttpEmailProviderAdapter`) — integrates an external transactional email provider over its HTTP API; the specific provider is chosen at deployment via configuration (`EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`), not hard-coded. Auth depends only on `EmailPort`, never on the vendor SDK type.
- **Fake adapter** (`FakeEmailAdapter`) — an in-memory/captured adapter used for development and automated tests; records sent messages for assertions and never touches the network.

Auth calls `EmailPort.sendVerification(to, token, lang)` to deliver the verification link. The verification token is a single-use, short-TTL, opaque random token stored **hashed**; the raw token appears only in the link generated for the email body.

**Rationale**: FR-002 requires an outbound verification email; FR-004 requires anti-enumeration (no delivery-status disclosure to the caller). Email is therefore a **real external integration** for this feature — the plan does not claim "no external integrations." Routing email through an Auth-owned port keeps domain rules decoupled from the vendor (Constitution IV — provider independence, SAD §8 provider abstraction), lets tests substitute the fake adapter without network or flakiness (Constitution IX), and avoids leaking provider SDK types into domain code. Config selection makes the provider swappable without code changes.

**Alternatives considered**:
- **SMTP direct send** — operationally fragile (deliverability, spam reputation); rejected.
- **Bundling a specific provider SDK directly into `auth.service`** — couples domain to vendor and makes tests hit the network; rejected (Constitution IV).
- **A single shared "NotificationPort" for all channels** — premature generalization for a feature that only sends verification email; rejected (Constitution XII). A broader notification abstraction can be extracted when a second channel is needed.
- **No email, OTP-only** — out of scope of PRD journey step 2 (email verification); not chosen.

**Tests**: `FakeEmailAdapter` is injected in unit/contract tests to assert the verification email is sent with a token and the correct language; production-adapter failure paths (timeout, 4xx/5xx) are tested with an adapter stub that throws, asserting fail-safe behavior (no advancement, no enumeration leak).

> Open external launch gate (not a planning decision): the chosen production transactional provider and its data-retention/training posture must be reviewed before production (Constitution VI).

---

## D3 — Authentication: JWT + refresh tokens, storage

**Decision**: `@nestjs/jwt` + Passport JWT strategy for access tokens; short-lived access token + rotating refresh token per SAD §13. Passwords hashed with Argon2id. Token storage on the frontend follows **Frontend_Architecture.md §15** only — access token in memory, refresh token in an HttpOnly, Secure, SameSite cookie; **no sensitive data and no tokens in `localStorage`** (Consistent with Frontend §15 and Consent policy §11: "No assessment content is stored in browser local storage"). No new token-storage strategy is introduced (FR-003).

**Rationale**: SAD §13 fixes the auth model (HTTPS, password hashing, JWT, refresh tokens, data isolation). Argon2id is the current standard for password hashing. Keeping the refresh token in an HttpOnly cookie mitigates XSS exfiltration while preserving refresh; in-memory access token limits the exposure window. This satisfies Constitution VI (no invented token-storage strategy) and FR-003.

**Alternatives considered**:
- **Storing access token in localStorage** — XSS-readable; explicitly rejected (Frontend §15, Consent policy §11).
- **Session-only opaque tokens in DB** — simpler revocation, but conflicts with the SAD §13 JWT decision; not chosen.
- **Passport-local-only with no refresh token** — does not satisfy SAD §13 refresh-token requirement.

---

## D4 — Internationalization (frontend) approach

**Decision**: `next-intl` for message catalogs and locale routing, with AR and EN as first-class locales. Locale is derived from the user's persisted profile preference (FR-010), set explicitly during onboarding (`/onboarding/profile`), and drives `dir="rtl|ltr"` on the document element. Validation messages, error/empty/loading/offline/expired-session/retry states, and safety copy all load from message catalogs — never hard-coded UI text (Constitution X, Frontend §12). A defined fallback rule applies for missing keys; **safety-critical strings must not silently fall back to the other language** (FR-037, Safety Matrix §11) — a missing safety key blocks continuation and shows the approved bilingual fallback copy.

**Rationale**: `next-intl` is the common Next.js App Router i18n library, supports RTL/LTR, and keeps strings in catalogs (not inline). Per-locale catalogs make bilingual parity auditable and testable (Constitution X — RTL tested, not just `dir`). Persisted locale means a returning user lands in their language before any UI renders.

**Alternatives considered**:
- **react-i18next** — capable, but heavier and less aligned with App Router server components.
- **Hard-coded conditionals / two parallel trees** — rejected by Constitution X ("Localization strings MUST NOT be scattered as hard-coded UI text").
- **Auto-detecting locale from `Accept-Language`** — used only as a pre-selection hint on the onboarding language screen; the user must actively choose before proceeding (Spec A3).

---

## D5 — Bilingual content storage and versioning

**Decision**: Approved bilingual content (assessment definition, safety questions, safety copy, consent service-boundary disclosure, result-band labels, suggested goals) is stored as **versioned reference data** in the database (one row per stable version) and loaded through typed loaders (`assessment-definition.ts`, `safety-copy.ts`, `resource-registry.ts`). Each version is immutable; completed records pin the version used (Assessment_Specification §11, Safety Matrix versioning, Consent policy §6). New versions are created (not edited) when meaning/polarity/scale/formula/ thresholds/copy change; spelling/translation corrections that preserve meaning may keep the same semantic version but remain auditable.

**Rationale**: Assessment_Specification §11 and Safety_Decision_Matrix require versioned, immutable definitions; historical results must never be silently recalculated under a newer version (Assessment §11). Storing as DB rows (not code constants) lets future admin tooling manage versions without code deploys, while typed loaders keep the schema compiler-checked. Pinning the version on `AssessmentResult`, `SafetyEvaluation`, and `ConsentRecord` preserves historical fidelity (spec §9: "historical safety evaluations retained, never overwritten").

**Alternatives considered**:
- **Hard-coded TS constant objects** — simple, but versioning/immutability/audit become ad-hoc and risk silent recalibration; rejected for definitions that must be auditable and immutable.
- **JSON files in the repo** — reviewable, but no DB-level immutability/pinning and harder to join to user records.
- **A separate CMS** — out of MVP scope (Constitution XII).

---

## D6 — Idempotency for assessment submission and consent

**Decision**: Idempotency via a **deterministic server-side guard keyed by `(user_id, active_assessment_id)`** rather than client-supplied idempotency keys:
- **Submit**: a single active assessment per user (FR-018a) is the natural idempotency key. The submit endpoint is a state transition `IN_PROGRESS|SUSPENDED → SUBMITTED → SCORED` guarded by an atomic DB conditional update (`UPDATE ... WHERE state IN ('IN_PROGRESS','SUSPENDED')`). A repeated/duplicate/concurrent submit hits a row already in `SUBMITTED`/`SCORED` and returns the existing result (FR-015, FR-034, AC-X4). The AssessmentResult row is unique on `assessment_id`.
- **Consent**: granted consent is unique on `(user_id, current_notice_set)`; a retry that re-records the same already-granted versions returns the existing record (Consent policy §12 "A retry must not create contradictory or duplicate consent records").
- **Answer save**: per-answer upsert keyed by `(assessment_id, question_id)` — saving the same answer is naturally idempotent.

**Rationale**: The spec already mandates "one active initial assessment per user" (FR-018a) and "exactly one result" (FR-015), so the natural key *is* the idempotency key. Client-supplied idempotency keys add a column and a header protocol without removing the need for the server-side guard — and Constitution XII discourages speculative infrastructure. The conditional-update pattern is the standard robust way to handle double-click/retry/concurrent-tabs (Spec §7 edge cases).

**Alternatives considered**:
- **Client-supplied `Idempotency-Key` header + dedup table** — robust general pattern, but adds infra this feature does not need; can be introduced if a future feature lacks a natural key.
- **Optimistic lock with `version` column** — works, but the state-machine conditional update already provides this guarantee.
- **Distributed lock (Redis)** — rejected as premature for a modular monolith (Constitution XII); the DB guard is sufficient and transactional.

---

## D7 — Log / trace / analytics redaction

**Decision**: A central redaction layer (`common/redact.ts`) applied at logging and observability boundaries — never at call sites — that strips/replaces a known denylist of fields (assessment answers, goal free text, safety answers, scores, results, classification details, consent record contents, passwords, tokens) and enforces structured logging with an allowlist of safe contextual fields (`user_id`, `module`, `route`, `request_id`, `onboarding_state`, `assessment_state`, `safety_level` is allowed only as a coarse routing tag if explicitly approved by the safety reviewer — default: not emitted). OpenTelemetry tracing configured with sanitized attributes; error responses never echo submitted answer payloads. A unit test asserts that fixture payloads containing sensitive fields produce sanitized output (FR-030, SC-010, Consent policy §11, Safety Matrix §10).

**Rationale**: FR-030 and SC-010 make this a verifiable requirement ("No assessment answers or results appear in logs, analytics, traces, or error reports"). Centralizing redaction (Constitution VIII — single responsibility, no business logic scattered) prevents a forgotten call site from leaking sensitive data. Denylist + safe-context allowlist is testable with fixtures (Constitution IX).

**Alternatives considered**:
- **Redact only at the logger constructor** — fragile; misses tracing spans and error-reporting integrations.
- **Field-level encryption of all PII** — heavier than needed here; the requirement is *exclusion*, not encrypted retention. Revisit if future features require retained sensitive data.
- **Rely on provider-side log scrubbing** — violates "must not appear" (FR-030) at the source; rejected.

---

## D8 — Safety classification implementation

**Decision**: The Safety classifier is a **pure deterministic function** over the saved answers (the three unscored safety answers SQ-01/SQ-02/SQ-03 plus the latest domain scores for the distress pattern), implementing exactly the matrix in Safety_Decision_Matrix.md §5. It lives in `safety/safety-classifier.ts`, takes a typed input object, and returns `{ level: 'NORMAL'|'DISTRESS'|'HIGH_RISK'|'CRISIS', reasons: string[] }`. It calls **no** DB, **no** network, **no** LLM. The Safety service wraps it with: persistence of the immutable `SafetyEvaluation`, evaluation timing (after each saved answer and on submit — FR-019a), highest-risk-wins conflict resolution, fail-closed error handling, and copy/resource resolution.

**SQ-03 rule (Safety_Decision_Matrix v1.0)**: SQ-01/SQ-02 determine HIGH_RISK and CRISIS. SQ-03 ("Current functional distress", codes F0/F1/F2/FX) classifies **DISTRESS only** — `SQ-03=F2` with no higher classification from SQ-01/SQ-02 yields DISTRESS; `F0/F1/FX` yield no direct escalation from SQ-03 alone. SQ-03 MUST NOT produce HIGH_RISK or CRISIS and MUST NOT downgrade a HIGH_RISK/CRISIS classification from SQ-01/SQ-02 (highest-risk-wins: e.g. SQ-01=S2 with SQ-03=F2 → CRISIS, not DISTRESS). All three questions remain unscored and separate from assessment domain scores.

The classifier is unit-tested with the §12 fixtures (S0/S1+D0/S1+D1/S2/SX+DX, SQ-03=F2→DISTRESS, SQ-03=F0/F1/FX→no escalation, SQ-03 never downgrades HIGH_RISK/CRISIS, distress boundaries, highest-risk-wins, per-answer + on-submit, fail-closed, duplicate-stale cannot downgrade, AR/EN parity, no AI, no unapproved resource).

**Rationale**: Constitution II + Safety Matrix §2 require deterministic classification with no generative AI; Constitution IX requires independent fixture-testable routing (FR-026). A pure function is the simplest design that is fully testable in isolation (no DB/AI), deterministic, and reusable by future chat/session safety flows (SAD §5 Safety module note). Wrapping it in a service keeps persistence and copy concerns separate from the rule (Constitution VIII — single responsibility).

**Alternatives considered**:
- **Rules engine library** — overkill for a 7-row matrix; rejected (Constitution XII).
- **Classify inside the Assessment module** — violates ownership separation (SAD ADR-006) and the spec's core invariant; rejected.
- **LLM-assisted classification with deterministic override** — explicitly forbidden (FR-020, Safety §2); rejected.

---

## D9 — SAFETY_HOLD and historical-evaluation model

**Decision**:
- `OnboardingState` gains `SAFETY_HOLD`; `Assessment` gains `SUSPENDED`. HIGH_RISK → Assessment `SUSPENDED` + Onboarding `SAFETY_HOLD`; CRISIS → Assessment interrupted (not `SUBMITTED`) + Onboarding `SAFETY_HOLD` (Safety Matrix §5/§6).
- Every `SafetyEvaluation` is **immutable and append-only**, versioned, with an `is_current` flag (or `evaluated_at` ordering) so the **latest completed** evaluation drives current routing while **all** historical evaluations are retained (spec §9, Safety Matrix §9 "historical safety answers are not edited or relabeled").
- **Re-entry is user-initiated** (after a later sign-in): the safety message is shown, the safety check is re-asked, a **new** `SafetyEvaluation` is created, and routing follows the new result. The system never edits, downgrades, or relabels the historical evaluation and never declares that a crisis clinically ended (FR-019b, Safety Matrix §9). A current NORMAL/DISTRESS permits the suspended assessment to resume; completion still requires all answers + a final safety evaluation.
- Client-side state cannot override server-side safety state; a stale or duplicate request cannot downgrade an existing classification (Safety Matrix §10). The normal assessment result is suppressed while in `SAFETY_HOLD` (FR-018a/FR-019b context; Assessment_Specification §9).

**Rationale**: Spec §9 and Safety Matrix §9 define this exact model. Append-only evaluations preserve history (auditable, never relabeled) while `is_current`/ordering lets current routing use the latest. This satisfies "Preserve historical safety evaluations while using the latest completed evaluation for current routing" (plan requirement) without a separate history table.

**Alternatives considered**:
- **Single mutable `SafetyEvaluation` updated in place** — violates "historical never overwritten"; rejected.
- **Separate `SafetyEvaluationHistory` table** — viable, but a single append-only table with `is_current` is simpler (Constitution XII) and equivalent.
- **Auto-resume after a TTL** — forbidden; re-entry must be user-initiated and the system must not claim the crisis ended; rejected.

---

## D10 — Retention and deletion implementation

**Decision**: A **deterministic scheduled retention-cleanup job** runs inside the modular monolith and deletes expired rows per Consent_and_Data_Retention_Policy §8: unverified accounts (7d), verified pre-consent accounts (30d inactivity), incomplete onboarding/profile (30d inactivity), incomplete assessment/goal answers (30d inactivity); completed data is retained while the account exists.

**Mechanism**: NestJS scheduling (`@nestjs/schedule`, a `@Cron` daily job) — chosen over BullMQ because the work is a bounded, single-server, periodic batch with no queueing, retries-with-backoff, or fan-out needs (Constitution XII — simplest sufficient design). The job is **deterministic**: each run selects rows whose `last_activity_at` (or `created_at` for unverified accounts) is older than the category-specific cutoff and hard-deletes them, ordered to respect referential integrity (answers → assessment → onboarding → profile → consent → account).

**Ownership**: A platform-level **RetentionModule** owns the scheduler and orchestration. It does **not** touch other modules' tables directly; each module exposes a narrow **deletion contract** returning only sanitized counts:
- `AuthDeletionPort.deleteExpired(cutoffs)` → unverified accounts + pre-consent accounts + superseded/retention-expired consent records.
- `ProfileDeletionPort.deleteExpired(cutoffs)` → onboarding state + profile/preferences for accounts with no surviving activity.
- `AssessmentDeletionPort.deleteExpired(cutoffs)` → incomplete assessment answers + dangling incomplete assessments; completed results retained while the account exists.
- `SafetyDeletionPort.deleteExpired(cutoffs)` → safety answers/evaluations tied to deleted accounts/assessments.
This respects SAD §5 / ADR-005 (one owner per entity; no cross-module direct table access). Account/user-initiated deletion (Consent policy §9) reuses the same per-module deletion contracts so there is exactly one deletion path per entity.

**Idempotency**: Each deletion is a `DELETE ... WHERE last_activity_at < :cutoff` (or the account-deletion equivalent). Re-running the job or retrying a failed batch is a no-op on already-deleted rows — there is no side effect beyond the intended deletion, and no row is ever deleted twice. A run writes a single `DeletionLog` row recording only sanitized counters (see observability); the log row itself is the idempotency/dedup marker for that run window.

**Failure handling**: Each category deletion runs in its own transaction; a failure in one category does not roll back or block the others. Per-record errors are caught, counted, and the run continues; failed rows are retried on the next run (forward-progress). If the whole job fails to start (e.g. DB unreachable), it simply runs at the next scheduled tick — expired data persisting slightly longer is safe; premature deletion is the only unsafe outcome and the cutoff predicate prevents it. Account deletion (user-initiated) follows Consent policy §9: idempotent, authenticated, blocks new processing on acceptance, and does not report completion until all in-scope stores confirm; a partial failure leaves access disabled and retries safely.

**Observability**: The job emits **only sanitized counters** — `{ window, category, deleted_count, error_count, run_ms }` — to logs/metrics. **No user content** (no email, no answers, no scores, no safety answers/levels, no consent contents) is ever logged (FR-030, Consent §8 "Logs … Must never contain assessment, goal free text, safety answers, or results"; research D7 redaction). A `DeletionLog` table stores these counters with a non-sensitive confirmation identifier and deletion timestamp, retained per Consent §8 (30d).

**Tests**:
- Unit: cutoff-date computation for each category (7d unverified, 30d incomplete onboarding/assessment) including boundary (exactly-at-cutoff).
- Integration (test DB, seeded fixtures): expired rows deleted; non-expired rows retained; completed-data retained while account exists; re-running the job deletes nothing more (idempotency); a category failure does not block other categories; `DeletionLog` written with sanitized counters only.
- Assertion: no sensitive payload appears in the captured log/trace output (research D7).
- Account-deletion contract test: full deletion of profile/preferences/onboarding/answers/goals/results/safety/consent + derived copies; idempotent re-request; no completion reported until all stores confirm.

**Alternatives considered**:
- **BullMQ / Redis queue worker** — heavier than needed; no queueing/retry/fan-out requirement for a bounded daily batch; rejected (Constitution XII). Revisit if retention work becomes large or must run on a separate worker pool.
- **Per-feature ad-hoc deletion logic (no orchestrator)** — duplicates deletion per module and risks inconsistent partial deletion; rejected in favor of one RetentionModule + shared contracts.
- **TTL-only with no explicit job** — relies on external mechanisms; does not satisfy the product retention requirement or user-initiated deletion (Consent §9); rejected.
- **Soft-delete only** — leaves sensitive data recoverable; conflicts with "full deletion of … derived, cached, indexed" (FR-031); not chosen for the MVP.

**Note**: User-initiated account deletion is a separate, platform-owned operation (spec §15: "Account deletion tooling … owned at the platform level"); this feature exposes the trigger and ensures its entities are covered by the same per-module deletion contracts. The RetentionModule scheduled job covers the inactivity-expiry side of Consent §8.

---

## Summary of NEEDS CLARIFICATION resolution

All Technical Context unknowns are resolved above (D1–D10). No `[NEEDS CLARIFICATION]` markers remain in the technical context. Remaining gates are **external launch gates**, not planning clarifications (see plan.md Reference Alignment and spec §16):

1. **Safety reviewer approval** of safety questions, classification rules, bilingual copy, re-entry behavior, and emergency-resource governance (Safety Matrix §13).
2. **Legal/privacy approval** of final Terms, Privacy Notice, consent wording, retention periods, age/residency rules, and deletion/backup commitments per jurisdiction (Consent policy §15).
3. **Transactional email provider** data-retention/training review before production (Constitution VI).
4. **Country-specific emergency resources** must be approved and versioned before display (Safety Matrix §8).

Proceed to Phase 1 (data-model.md, contracts/, quickstart.md).