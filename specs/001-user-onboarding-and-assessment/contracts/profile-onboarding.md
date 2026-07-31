# API Contract — Profile & Onboarding

**Feature**: 001-user-onboarding-and-assessment
**Module**: Profile (Profile, Preferences, OnboardingState)
**Date**: 2026-07-29
**Base**: `HTTPS`, `/api/v1`. Protected routes require access token + EMAIL_VERIFIED + a granted consent record (OnboardingService guard).

> The OnboardingService guard is the server-side authority for step ordering and completion (FR-033). Route guards are UX only (FR-028).

---

## GET /onboarding/state

Return the current onboarding state and the next unfinished step (US8/US9, FR-033).

- 200: `{ onboarding_state, current_step, assessment_state, language_code, requires_reconsent, next_route }`

## GET /me/profile

- 200: `{ language_code, timezone }` (only minimum profile fields — FR-009) or 404 if not yet created.

## PUT /onboarding/profile

Collect the minimum profile: language + timezone (FR-009/FR-010). Advances onboarding.

- Body: `{ language_code: "ar"|"en", timezone: string }`
- Validation: language ∈ {ar,en}; timezone is a valid IANA name (Zod).
- 200: `{ profile, preferences, onboarding_state: "ASSESSMENT_PENDING", next: "/assessment" }`
- 400: `{ error: { code: "VALIDATION", fields: { ... } } }` — localized messages (FR-037).
- Side effect: persists `Profile` + `Preferences`; persists `language_code` → drives RTL/LTR + localization for all subsequent screens (FR-010).

## PUT /me/preferences/language

Change language mid-journey (FR-011). Re-renders content/direction without losing saved progress.

- Body: `{ language_code: "ar"|"en" }`
- 200: `{ language_code, dir: "rtl"|"ltr" }`
- Invariant: does NOT clear onboarding state or saved assessment answers (Safety Matrix §11 / FR-011).

## GET /onboarding/completion

Authoritative completion check used by the frontend router (FR-033, US9).

- 200: `{ completed: bool, onboarding_state, post_onboarding_route: "/dashboard" }`
- `completed` is true only when `OnboardingState = COMPLETED` (and not `SAFETY_HOLD`). Used to route returning completed users to `/dashboard` and incomplete users to the unfinished step (FR-033). If state cannot be determined, route to the earliest unfinished step (US9 failure path).

---

## Routing rules (server-enforced guard)

The OnboardingService guard enforces, before any protected step:
1. Account `EMAIL_VERIFIED` (else → `/verify-email`).
2. Granted consent for the current `NoticeVersionSet` (else → `/onboarding/boundary`; re-consent if version changed — FR-008).
3. Profile saved before assessment (else → `/onboarding/profile`).
4. Not in `SAFETY_HOLD` for normal-result routes; `SAFETY_HOLD` routes to `/safety/hold` (FR-019b).
5. `COMPLETED` users cannot re-enter onboarding unconditionally (US9, FR-018a).

Concurrent-state transitions use conditional updates to avoid lost updates across tabs (Spec §7).