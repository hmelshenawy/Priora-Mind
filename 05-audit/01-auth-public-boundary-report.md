# Boundary Hardening Phase 01 — Auth Public Surface

**Date:** 2026-08-09  
**Scope:** Auth public surface and mechanical production-consumer import updates only  
**Behavior changes:** None

## 1. Before Auth public surface

Auth had no intentional TypeScript public entry point. Production consumers imported legitimate Auth capabilities from implementation paths:

| Consumer | Symbol | Previous path | Kind |
|---|---|---|---|
| Assessment | `JwtAuthGuard`, `EmailVerifiedGuard`, `JwtPayload` | `auth/guards/*`, `auth/tokens/jwt-token.service` | injectable guards + type |
| Assessment | `ConsentService` | `auth/consent.service` | injectable service |
| Coaching | `JwtAuthGuard`, `EmailVerifiedGuard`, `JwtPayload` | `auth/guards/*`, `auth/tokens/jwt-token.service` | injectable guards + type |
| Coaching | `ConsentService` | `auth/consent.service` | injectable service |
| Conversations | `JwtAuthGuard`, `EmailVerifiedGuard`, `JwtPayload` | `auth/guards/*`, `auth/tokens/jwt-token.service` | injectable guards + type |
| Profile | `JwtAuthGuard`, `EmailVerifiedGuard`, `JwtPayload` | `auth/guards/*`, `auth/tokens/jwt-token.service` | injectable guards + type |
| Profile | `ConsentService` | `auth/consent.service` | injectable service |
| Safety | `JwtAuthGuard`, `EmailVerifiedGuard`, `JwtPayload` | `auth/guards/*`, `auth/tokens/jwt-token.service` | injectable guards + type |
| Safety | `ConsentService` | `auth/consent.service` | injectable service |
| Retention | `JwtAuthGuard`, `EmailVerifiedGuard`, `JwtPayload` | `auth/guards/*`, `auth/tokens/jwt-token.service` | injectable guards + type |
| Retention | `AUTH_DELETION_PORT`, `AuthDeletionPort` | `auth/ports/auth-deletion.port` | injection token + type |

Before this phase, `AuthModule` exported `AuthService`, `ConsentService`, concrete `AuthDeletionService`, `AUTH_DELETION_PORT`, and `EMAIL_PORT`. `AuthCoreModule` exported Passport/JWT modules, `JwtTokenService`, `RefreshCookieService`, and `JwtStrategy`.

Production searches confirmed that no external production module directly consumes `AuthService`, concrete `AuthDeletionService`, `EMAIL_PORT`, `JwtTokenService`, `RefreshCookieService`, or `JwtStrategy`.

## 2. After Auth public surface

Added `02-BACKEND/src/modules/auth/auth.public.ts` as the single intentional TypeScript entry point. It exports only:

- `ConsentService`
- `JwtAuthGuard`
- `EmailVerifiedGuard`
- type-only `JwtPayload`
- `AUTH_DELETION_PORT`
- type-only `AuthDeletionPort`

No files were moved. No port, repository, DTO, or compatibility layer was introduced.

## 3. Production consumers updated

| Module | Files updated | Public capabilities used |
|---|---|---|
| Assessment | controller; onboarding service | guards, payload, consent |
| Coaching | controller; eligibility service | guards, payload, consent |
| Conversations | controller | guards, payload |
| Profile | controller; profile service | guards, payload, consent |
| Safety | controller; safety service | guards, payload, consent |
| Retention | account-deletion controller/service; retention service | guards, payload, deletion token/contract |

All updates were import-path replacements only.

## 4. Deep Auth imports removed

The final production boundary scan returned no imports outside Auth matching:

- `auth/guards/**`
- `auth/tokens/**`
- `auth/consent.service`
- `auth/ports/auth-deletion.port`

Auth's own internal imports remain direct, as intended.

## 5. Nest module export changes

`AuthModule` now registers and exports `JwtAuthGuard` and `EmailVerifiedGuard`, alongside the already exported `ConsentService`. This makes all public runtime Auth capabilities resolvable through an imported `AuthModule` without duplicating providers in consumers.

`AuthCoreModule` was intentionally unchanged. `JwtPayload` and `AuthDeletionPort` are TypeScript types and require no Nest export.

## 6. Exports intentionally left unchanged

The following existing exports were not trimmed in this phase:

- `AuthDeletionService`: no production consumer was found, but `tests/contract/consent.contract.spec.ts` explicitly resolves the concrete provider from the Nest testing module.
- `EMAIL_PORT`: no production consumer was found, but multiple contract/e2e suites override this provider through their compiled application modules.
- `AuthService`: no external production consumer was found. It was left exported to keep Phase 01 intentionally small and avoid changing an established testing/bootstrap surface without a dedicated assertion.
- `AuthCoreModule` exports: low-level token/cookie/strategy services are required by Auth composition, and trimming/re-export semantics were not necessary to eliminate production deep imports.

These are conservative deferrals, not additions to `auth.public.ts`.

## 7. Tests run and exact results

### Unit and contract coverage

Command:

```text
npx vitest run tests/unit/consent-versions.spec.ts tests/contract/auth.contract.spec.ts tests/contract/consent.contract.spec.ts tests/contract/assessment.contract.spec.ts tests/contract/coaching.contract.spec.ts tests/contract/safety.contract.spec.ts tests/contract/profile-onboarding.contract.spec.ts tests/contract/conversations/conversation-api.contract.spec.ts
```

Result: **PASS — 8 test files, 123 tests**.

This covers Auth/consent behavior, guard metadata and protected contracts across Assessment, Coaching, Safety, Profile, and Conversations.

### Protected-route e2e regression coverage

Command:

```text
npx vitest run --config vitest.config.e2e.ts tests/e2e/assessment-submit-idempotency.spec.ts tests/e2e/coaching-plan.spec.ts tests/e2e/safety-routing.spec.ts tests/e2e/conversations/conversation-send.e2e-spec.ts tests/e2e/resume-restart.spec.ts tests/e2e/account-deletion.spec.ts
```

Result: **PASS — 6 test files, 31 tests**.

The selected suites cover Assessment, Coaching, Safety, Conversations, Profile/onboarding resume, and Retention/account deletion. Existing assertions for missing/invalid authentication, verified users, consent gates, route access, and cross-user isolation remained green.

## 8. Build/typecheck result

Command: `npm run build` in `02-BACKEND`.

Result: **PASS** (`nest build`, exit code 0).

The successful Nest build plus contract/e2e application compilation verifies runtime dependency resolution for the affected modules.

## 9. Auth-scope and affected-consumer lint

Command: `npx eslint` over `auth.public.ts`, `auth.module.ts`, and every mechanically updated production consumer file, without `--fix`.

Result: **PASS — 0 errors, 0 warnings**.

## 10. Project-wide lint

Command: `npx eslint .` in `02-BACKEND`, without `--fix`.

Result: **FAIL — 1 unrelated pre-existing error**:

```text
src/modules/ai/providers/ollama-conversation-llm.provider.ts
71:7  error  Unnecessary try/catch wrapper  no-useless-catch
```

No Auth or affected-consumer lint failure was reported. The AI file was outside Phase 01 and was not modified.

## 11. `git diff --check`

Result: **PASS — no whitespace errors**.

Git printed existing LF-to-CRLF working-copy warnings for dirty files. These are line-ending notices, not `diff --check` failures.

## 12. Behavior preservation confirmation

No implementation logic, controller route, DTO, JWT payload, token operation, cookie behavior, consent rule, guard decision, HTTP status, deletion behavior, email provider behavior, or Prisma schema was changed. The same classes and tokens are used; only their public import surface and Nest exports were formalized.

No duplicate Auth providers were added to consumer modules. No new port was introduced.

## 13. Deferred Auth boundary issues

- Decide in a later surface-trimming pass whether `AuthService`, concrete `AuthDeletionService`, and `EMAIL_PORT` can be removed from `AuthModule.exports` after replacing or tightening the test-only lookup/override assumptions.
- Review whether `AuthCoreModule` must remain imported separately by the root module and whether all of its exports are required. This is composition cleanup, not needed for the Phase 01 public boundary.
- Tests still import some Auth internals directly for focused white-box setup. Phase 01 required production consumers to migrate; test import cleanup is intentionally deferred.
- Safety, AI, Retrieval, Profile/Assessment data ownership, and Retention ownership hardening were not started.

## Console summary

Phase 01 complete: one Auth public entry point added; six production consumer modules migrated; guards exported through `AuthModule`; no forbidden production deep Auth imports remain; 154 focused tests passed; build and scoped lint passed; project lint is blocked only by the known unrelated AI `no-useless-catch` error; no Auth behavior changed.
