# API Contract — Consent

**Feature**: 001-user-onboarding-and-assessment
**Module**: Auth (ConsentRecord)
**Date**: 2026-07-29
**Base**: `HTTPS`, `/api/v1`. All protected routes require a valid access token + `EMAIL_VERIFIED`.

> Fail-closed (FR-007): if the current notice versions cannot be determined, consent MUST NOT be recorded and the user cannot proceed.

---

## GET /onboarding/notices

Return the current service-boundary disclosure, Terms link, Privacy Notice link, and their version identifiers, in the user's preferred (or default) language (FR-005/FR-006, Consent §2).

- Auth: required (EMAIL_VERIFIED)
- Query: `?lang=ar|en` (defaults to stored preference or `en`)
- 200:
  ```json
  {
    "service_boundary_version": "...",
    "terms_version": "...",
    "privacy_notice_version": "...",
    "service_boundary_text": { "en": "...", "ar": "..." },
    "terms_link": { "en": "...", "ar": "..." },
    "privacy_notice_link": { "en": "...", "ar": "..." },
    "required_acknowledgments": [
      "service_boundary", "terms", "privacy_notice"
    ]
  }
  ```
- 503: `{ error: { code: "NOTICES_UNAVAILABLE" } }` → consent blocked, no advance (Consent §12).

## GET /onboarding/consent

Return the user's current consent state (latest granted record, if any) and whether re-consent is required.

- 200: `{ has_granted: bool, requires_reconsent: bool, current_versions: {...}, recorded_versions: {...}|null, consent_language_code: "ar"|"en"|null }`

## POST /onboarding/consent

Record a `ConsentRecord` (FR-006/FR-007). The three acknowledgments are required separately (Consent §4).

- Body:
  ```json
  {
    "service_boundary_version": "...",
    "terms_version": "...",
    "privacy_notice_version": "...",
    "acknowledgments": {
      "service_boundary": true,
      "terms": true,
      "privacy_notice": true
    },
    "consent_language_code": "ar" | "en",
    "product_channel_id": "..."
  }
  ```
- Validation: all three acknowledgments MUST be `true`; versions MUST match the current `NoticeVersionSet`; language ∈ {ar,en}.
- 201: `{ consent_record_id, granted_at, onboarding_state: "IN_PROGRESS", next: "/onboarding/profile" }`
- 409: `{ error: { code: "RECONSENT_REQUIRED", current_versions: {...} } }` — recorded versions differ from current (FR-008); client re-presents and re-consents.
- 400: `{ error: { code: "ACKNOWLEDGMENTS_INCOMPLETE" } }` — declined/incomplete → no advance (Consent §4).
- 503: `{ error: { code: "NOTICES_UNAVAILABLE" } }` — fail closed.
- Idempotent: a retry with the same already-granted versions returns the existing record (research D6, Consent §12); a new version set creates a new row and marks the prior superseded (retained for audit, Consent §8).

---

## Behavior notes

- Consent MUST be recorded before any profile/assessment data is collected (FR-006, Consent §2). Enforced by the OnboardingService guard on profile/assessment routes.
- The record MUST NOT contain assessment/safety answers, inferred state, or copied notice text (Consent §5).
- Re-consent pauses protected coaching features (Consent §6); this feature only reaches the profile/assessment steps.
- Sensitive: consent record contents are not emitted to logs/analytics (FR-030).

## Retention & deletion (Consent policy §8/§9, research D10)

- **Scheduled retention cleanup**: a platform RetentionModule daily `@Cron` job hard-deletes expired rows through per-module deletion contracts: unverified accounts (7d), verified pre-consent accounts (30d inactivity), incomplete onboarding/profile (30d inactivity), incomplete assessment/goal answers (30d inactivity), and retention-expired/superseded consent records. Completed/consented data retained while the account exists. The job is deterministic and idempotent (`DELETE ... WHERE last_activity_at < :cutoff`); failures are per-category and retry on the next run; observability emits only sanitized counters to a `DeletionLog` row — never consent contents.
- **User-initiated account deletion**: idempotent, authenticated, blocks new processing on acceptance, removes consent records alongside all other in-scope data, and does not report completion until all in-scope stores confirm (Consent §9). It reuses the same per-module deletion contracts as the scheduled job.
- These are product retention requirements from the authoritative Consent policy (not invented). The deletion *mechanism* is platform-owned (spec §15).