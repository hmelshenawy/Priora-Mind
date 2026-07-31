# API Contract — Auth

**Feature**: 001-user-onboarding-and-assessment
**Module**: Auth
**Date**: 2026-07-29
**Base**: `HTTPS`, `/api/v1`. All responses `application/json; charset=utf-8`.
**Auth**: JWT access (Authorization: Bearer) + refresh cookie (HttpOnly, Secure, SameSite) per SAD §13 / research D3. No sensitive data or tokens in `localStorage`.

> Anti-enumeration (FR-004): registration and login error responses are identical whether or not the account exists. No delivery-status disclosure.

---

## POST /auth/register

Create a `UserAccount` in `REGISTERED` and send a verification email (FR-001/FR-002).

- Auth: public
- Body: `{ email: string, password: string, consent_language_code?: "ar"|"en" }`
- Validation: email format; password policy (no value echoed); Zod.
- 201: `{ message: "If this email is not already registered, a verification email has been sent.", user_reference?: never }` — **same response shape for duplicate email**.
- 400: `{ error: { code: "VALIDATION", fields: { ...redacted... } } }` — no email-presence leak.
- Side effect: `UserAccount(REGISTERED)` + `VerificationToken` (hashed) + verification email via `EmailPort` (research D2).

## POST /auth/resend-verification

Re-send verification; rotates the token; rate-limited.

- Auth: public (by email) — returns the same anti-enumeration 200 regardless of existence.
- Body: `{ email: string }`
- 200: `{ message: "If the email is registered and unverified, a new verification link has been sent." }`

## GET /auth/verify-email?token=...&userId=...

Verify a single-use token; transition `REGISTERED → EMAIL_VERIFIED` (FR-002).

- Auth: public
- 200: `{ status: "verified", redirect: "/onboarding/boundary" }`
- 410: `{ error: { code: "TOKEN_EXPIRED_OR_USED" } }` — friendly expired/used state with re-send option (US1).
- 400: `{ error: { code: "TOKEN_INVALID" } }`
- Idempotent: re-verifying a consumed token returns the expired/used state, not an error storm.

## POST /auth/login

- Auth: public
- Body: `{ email, password }`
- 200: `{ accessToken: <in-memory use>, profile: { onboarding_state, language_code } }` + `Set-Cookie: refresh=...`
- 401: `{ error: { code: "INVALID_CREDENTIALS" } }` — identical for unknown email vs wrong password (FR-004).
- Sets `last_activity_at`.

## POST /auth/refresh

- Auth: refresh cookie
- 200: new `accessToken`; rotates refresh (revokes prior).
- 401: invalid/expired refresh → client re-authenticates; expired-session UX (FR-035).

## POST /auth/logout

- Auth: required
- 204; revokes the refresh token family. Client clears in-memory access token.

---

## Behavior notes

- Email is a **real external integration** for this feature (research D2). Verification emails are sent through an Auth-owned `EmailPort`; the production adapter integrates a config-selected external transactional email provider (`EMAIL_PROVIDER`/`EMAIL_API_KEY`/`EMAIL_FROM`), and a `FakeEmailAdapter` is injected in development and automated tests (no network). Auth depends only on `EmailPort`, never on the vendor SDK.
- Verification tokens stored **hashed**; the raw token appears only in the link generated for the email body (research D2).
- `EMAIL_VERIFIED` is the gate to advance past consent (OnboardingService guard; FR-002, A5).
- No new token-storage strategy (FR-003).
- No sensitive content (password, token, email body) in logs/traces (FR-030, research D7).
- Email send failures do not advance the user and do not disclose delivery status to the caller (FR-004); the register/resend responses remain anti-enumeration-identical.