# Auth Module Structural Refactor Report

Scope: `02-BACKEND/src/modules/auth/**` + only imports/tests that must change mechanically because Auth files move. No extraction, no split — this is a **move-only** structural standardization. All 23 Auth source files were already cohesive and ≤300 lines (max 236), so the file-size rule required no fragmentation.

The Auth public boundary from Boundary Hardening Phase 01 (`auth.public.ts`) was already complete before this task. It is preserved unchanged in shape and surface — only one internal path inside it was updated.

Verdict: **Behavior-preserving structural refactor complete.** 10 flat source files moved into the standard folder layout, 2 Auth-owned unit tests reorganized. Zero behavior changes — registration, login, logout, refresh, email verification, JWT, cookies, password hashing, consent, guards, deletion, and email delivery all unchanged. The public boundary is intact: zero external production deep-imports of any Auth subpath. All gates green.

---

## 1. Before source tree

23 files, 10 flat at the module root + `guards/` (2) + `ports/` (4) + `strategy/` (1) + `tokens/` (3):

```
src/modules/auth/
├── auth.controller.ts
├── auth.dto.ts
├── auth.errors.ts
├── auth.module.ts
├── auth.public.ts
├── auth.service.ts
├── auth-core.module.ts
├── auth-deletion.service.ts
├── consent.controller.ts
├── consent.dto.ts
├── consent.errors.ts
├── consent.service.ts
├── password.util.ts
├── guards/
│   ├── email-verified.guard.ts
│   └── jwt-auth.guard.ts
├── ports/
│   ├── auth-deletion.port.ts
│   ├── email.port.ts
│   ├── fake-email.adapter.ts
│   └── http-email.adapter.ts
├── strategy/
│   └── jwt.strategy.ts
└── tokens/
    ├── jwt-token.service.ts
    ├── refresh-cookie.service.ts
    └── token-hash.ts
```

## 2. File classification inventory

| File | Responsibility | Lines | Major dependencies | Consumers | Proposed dest | Move? |
|---|---|---|---|---|---|---|
| auth.controller.ts | controller (HTTP: register/resend/verify/login/refresh/logout) | 71 | AuthService, JwtAuthGuard, refresh-cookie, JwtPayload, auth.dto, ZodValidationPipe | AuthModule | controllers/ | yes |
| consent.controller.ts | controller (HTTP: notices/consent GET+POST) | 60 | ConsentService, JwtAuthGuard, EmailVerifiedGuard, JwtPayload, consent.dto | AuthModule | controllers/ | yes |
| auth.service.ts | application/domain service (register/login/refresh/logout/verify) | 236 | Prisma, JwtTokenService, RefreshCookieService, token-hash, EMAIL_PORT, password.util, auth.dto, auth.errors | AuthController, AuthModule | services/ | yes |
| consent.service.ts | application/domain service (notices/status/record) | 190 | Prisma, consent.dto, consent.errors | ConsentController, auth.public (ProfileModule), AuthModule | services/ | yes |
| auth-deletion.service.ts | application/domain service (deletion: expired + account + consent) | 110 | Prisma, AuthDeletionPort | RetentionModule (via AUTH_DELETION_PORT) | services/ | yes |
| auth.dto.ts | DTO/schema (Zod + response types) | 62 | zod | AuthController, AuthService | dto/ | yes |
| consent.dto.ts | DTO/schema (Zod + response types) | 65 | zod | ConsentController, ConsentService, consent.errors | dto/ | yes |
| auth.errors.ts | errors (stable codes) | 26 | @nestjs/common | AuthService | constants/ | yes |
| consent.errors.ts | errors (stable codes) | 37 | consent.dto (VersionSet type) | ConsentService | constants/ | yes |
| password.util.ts | utility (argon2 hash/verify — pure) | 17 | argon2 | AuthService | utils/ | yes |
| auth.module.ts | module composition (AuthModule) | 54 | AuthCoreModule + all controllers/services/ports/guards | app.module | root | stays |
| auth.public.ts | public boundary (Phase 01) | 5 | re-exports 6 symbols | 12 production consumers | root | stays |
| auth-core.module.ts | module composition (AuthCoreModule — JWT/Passport/cookie framework) | 25 | JwtStrategy, JwtTokenService, RefreshCookieService | app.module, AuthModule | root | stays |
| guards/jwt-auth.guard.ts | guard (Passport 'jwt') | 9 | @nestjs/passport | auth.public, AuthController | guards/ | stays |
| guards/email-verified.guard.ts | guard (EMAIL_VERIFIED check) | 28 | JwtPayload (tokens) | auth.public, ConsentController | guards/ | stays |
| ports/auth-deletion.port.ts | port (AUTH_DELETION_PORT + AuthDeletionPort) | 37 | — | auth.public (RetentionModule) | ports/ | stays |
| ports/email.port.ts | port (EMAIL_PORT + EmailPort) | 25 | @priora/shared-types | AuthModule, AuthService | ports/ | stays |
| ports/fake-email.adapter.ts | provider/adapter (in-memory email) | 34 | email.port | AuthModule (EMAIL_PORT binding), tests | ports/ | stays |
| ports/http-email.adapter.ts | provider/adapter (HTTP email) | 58 | email.port, ConfigService | AuthModule (EMAIL_PORT binding) | ports/ | stays |
| strategy/jwt.strategy.ts | strategy (Passport JWT) | 25 | JwtPayload (tokens), passport-jwt | AuthCoreModule | strategy/ | stays |
| tokens/jwt-token.service.ts | token/JWT infra (issue/verify access+refresh) | 62 | JwtService, ConfigService | AuthService, AuthCoreModule, auth.public (JwtPayload) | tokens/ | stays |
| tokens/refresh-cookie.service.ts | cookie infra (set/clear refresh cookie) | 35 | ConfigService | AuthService, AuthController | tokens/ | stays |
| tokens/token-hash.ts | utility (pure crypto: generate/hash tokens) | 44 | node:crypto | AuthService, tests | tokens/ | stays |

## 3. Final source tree

23 files (same count — move-only, no extraction). Every folder is non-empty. No `repositories/` (Phase 5 decision — see item 8). `core/` NOT created (Phase 9 decision — see item 12):

```
src/modules/auth/
├── auth.module.ts                       (root — wiring only)
├── auth.public.ts                       (root — public boundary, Phase 01 preserved)
├── auth-core.module.ts                  (root — AuthCore framework composition)
├── controllers/
│   ├── auth.controller.ts
│   └── consent.controller.ts
├── services/
│   ├── auth.service.ts
│   ├── consent.service.ts
│   └── auth-deletion.service.ts
├── dto/
│   ├── auth.dto.ts
│   └── consent.dto.ts
├── constants/
│   ├── auth.errors.ts
│   └── consent.errors.ts
├── utils/
│   └── password.util.ts
├── guards/
│   ├── jwt-auth.guard.ts
│   └── email-verified.guard.ts
├── ports/
│   ├── auth-deletion.port.ts
│   ├── email.port.ts
│   ├── fake-email.adapter.ts
│   └── http-email.adapter.ts
├── strategy/
│   └── jwt.strategy.ts
└── tokens/
    ├── jwt-token.service.ts
    ├── refresh-cookie.service.ts
    └── token-hash.ts
```

## 4. Every file moved

10 source files moved (git-tracked renames; history preserved). Files with no internal-import changes show as pure `R`; files whose imports were rewritten show as `RM`:

| Moved from | Moved to |
|---|---|
| auth.controller.ts | controllers/auth.controller.ts |
| consent.controller.ts | controllers/consent.controller.ts |
| auth.service.ts | services/auth.service.ts |
| consent.service.ts | services/consent.service.ts |
| auth-deletion.service.ts | services/auth-deletion.service.ts |
| auth.dto.ts | dto/auth.dto.ts |
| consent.dto.ts | dto/consent.dto.ts |
| auth.errors.ts | constants/auth.errors.ts |
| consent.errors.ts | constants/consent.errors.ts |
| password.util.ts | utils/password.util.ts |

## 5. Every file intentionally not moved and why

**Module composition + public boundary (stayed at root):**
- `auth.module.ts` — module wiring; belongs at the module root. Internal wiring import paths updated to the new folders; providers/exports unchanged.
- `auth.public.ts` — the intentional public entry point (Phase 01). Stays at the root so all consumers keep importing `auth/auth.public`. One internal path updated (`./consent.service` → `./services/consent.service`); the 6 exported symbols are unchanged.
- `auth-core.module.ts` — AuthCore framework composition. Stays at root per the Phase 9 decision (item 12): `app.module.ts` imports `AuthCoreModule` from the root, and the boundary forbids deep-importing `auth/core/**`. Its providers (`tokens/`, `strategy/`) also stay, so this file needed no changes.

**Already-organized subfolders (stayed — already in their correct category):**
- `guards/jwt-auth.guard.ts`, `guards/email-verified.guard.ts` — guards are a first-class category already in `guards/`. Unchanged.
- `ports/auth-deletion.port.ts`, `ports/email.port.ts`, `ports/fake-email.adapter.ts`, `ports/http-email.adapter.ts` — justified ports + their adapters already in `ports/`. Unchanged.
- `strategy/jwt.strategy.ts` — Passport strategy, part of the AuthCore framework boundary. Unchanged (Phase 9 decision).
- `tokens/jwt-token.service.ts`, `tokens/refresh-cookie.service.ts`, `tokens/token-hash.ts` — token/cookie primitives, part of the AuthCore framework boundary. Unchanged (Phase 9 decision).

## 6. Controller organization

`controllers/` holds the two Auth-owned HTTP controllers, not merged, not split:
- `auth.controller.ts` (71) — `register`, `resend-verification`, `verify-email`, `login`, `refresh`, `logout` routes. Routes, decorators, guards (`JwtAuthGuard` on logout), status codes (201/200/204), and DTO contracts (Zod pipes) preserved exactly. Import paths rewritten: `../../common` → `../../../common`; `./guards`, `./tokens`, `./auth.service`, `./auth.dto` → `../guards`, `../tokens`, `../services/auth.service`, `../dto/auth.dto`.
- `consent.controller.ts` (60) — `GET notices`, `GET consent`, `POST consent` under `/onboarding`. `@UseGuards(JwtAuthGuard, EmailVerifiedGuard)` class-level guard preserved. Import paths rewritten analogously.

Both controllers kept their `@Controller('auth')` / `@Controller('onboarding')` base paths (Auth owns ConsentRecord; the consent controller path is `/onboarding/*` by design — unchanged).

## 7. Service organization

`services/` holds the three Auth application/domain services:
- `auth.service.ts` (236) — register/login/refresh/logout/verifyEmail + private helpers (createUnverifiedAccount, rotateAndSendVerification, issueAccessAndRefresh). Under 300; NOT split. Import paths rewritten: `../../prisma` → `../../../prisma`; `./tokens/*` → `../tokens/*`; `./ports/email.port` → `../ports/email.port`; `./password.util` → `../utils/password.util`; `./auth.dto` → `../dto/auth.dto`; `./auth.errors` → `../constants/auth.errors`.
- `consent.service.ts` (190) — getNotices/getConsentStatus/hasGrantedCurrentConsent/recordConsent + private currentNoticeSet + module-level pure helpers (toVersionSet, sameVersions, allAcknowledged, errName). Under 300; NOT split. Import paths rewritten: `../../prisma` → `../../../prisma`; `./consent.dto` → `../dto/consent.dto`; `./consent.errors` → `../constants/consent.errors`.
- `auth-deletion.service.ts` (110) — deleteExpired/deleteConsentForUsers/deleteAccountForUsers (implements `AuthDeletionPort`). Import paths rewritten: `../../prisma` → `../../../prisma`; `./ports/auth-deletion.port` → `../ports/auth-deletion.port`.

No one-method services created; no responsibilities redesigned.

## 8. Repository decision

**`repositories/` not created — no justified repository abstraction required.**

Auth services access Prisma directly (`auth.service`, `consent.service`, `auth-deletion.service`). Evaluation against the Phase 5 criteria:
- *Persistence logic substantial and mixed with orchestration?* No — each service is under 300 lines (236 / 190 / 110) and the persistence is tightly bound to domain invariants (anti-enumeration on register/resend, hashed-token rotation, fail-closed consent, idempotent deletion). The queries do not form a standalone coherent responsibility separable from the orchestration.
- *Repeated Auth persistence queries forming a coherent responsibility?* No — the queries are heterogeneous (UserAccount, VerificationToken, RefreshToken, ConsentRecord, NoticeVersionSet) and each is purpose-specific to its flow.
- *Extraction needed to bring an oversized service under 300 lines?* No — all services are already under 300.
- *Existing repository already exists?* No.

Per the directive ("Do NOT create repositories simply because a `repositories/` folder is part of the preferred convention"), no repository layer was introduced. Direct Prisma access stays where it is; persistence ownership is deferred to a possible future Auth ownership-hardening phase.

## 9. DTO organization

`dto/` holds the two Auth-owned DTO/schema files:
- `auth.dto.ts` (62) — Zod schemas (`registerSchema`, `loginSchema`, `resendVerificationSchema`, `verifyEmailQuerySchema`) + response types + anti-enumeration ack constants. No internal imports; unchanged content.
- `consent.dto.ts` (65) — Zod schemas (`noticesQuerySchema`, `recordConsentSchema`) + response types (`NoticesResponse`, `ConsentStatusResponse`, `RecordConsentResponse`, `VersionSet`, `BilingualEntry`). No internal imports; unchanged content.

All validation behavior preserved: no Zod rules, field names, optional/required semantics, error codes, or response shapes changed. The files are move-only.

## 10. Guard organization

`guards/` (pre-existing, stayed) holds the two guards:
- `jwt-auth.guard.ts` (9) — `AuthGuard('jwt')`. Exported via `auth.public.ts`.
- `email-verified.guard.ts` (28) — `EMAIL_NOT_VERIFIED` 403 check. Imports `JwtPayload` from `../tokens/jwt-token.service` (tokens/ stayed, so the import is unchanged). Exported via `auth.public.ts`.

Guards remain a first-class category. External consumers continue importing them through `auth.public.ts` — never directly from `guards/` (verified in item 25). Guard behavior unchanged.

## 11. Port organization

`ports/` (pre-existing, stayed) holds the two justified Auth ports + their adapters:
- `auth-deletion.port.ts` (37) — `AUTH_DELETION_PORT` symbol + `AuthDeletionPort` interface + `AuthCutoffs` / `DeletionCategoryCounters`. Exported via `auth.public.ts` for the RetentionModule.
- `email.port.ts` (25) — `EMAIL_PORT` symbol + `EmailPort` interface + `VerificationEmailInput`. Consumed by `AuthService` and bound in `AuthModule`.
- `fake-email.adapter.ts` (34) + `http-email.adapter.ts` (58) — the two `EmailPort` adapters, config-selected in `AuthModule.useFactory`.

No new ports were created. No service/guard/token-service was converted into a port/interface (Phase 8). The deletion + email provider abstractions remain behaviorally unchanged.

## 12. AuthCore / token / cookie / strategy decision

**Decision: preserve the existing AuthCore structure as-is.** `auth-core.module.ts` stays at the auth root; `tokens/` (jwt-token.service, refresh-cookie.service, token-hash) and `strategy/` (jwt.strategy) stay in their current folders. A `core/` folder was NOT created.

Justification:
- `app.module.ts` imports `AuthCoreModule` directly from `./modules/auth/auth-core.module` (the root). This is the composition root wiring the JWT/Passport framework app-wide (it exports `PassportModule` + `JwtModule` so guards work globally).
- The Phase 01 boundary explicitly forbids external production deep-imports of `auth/core/**`. Moving `auth-core.module.ts` into `core/` would turn app.module's import into a deep import of `auth/core/**` — a boundary violation.
- The only alternative would be exporting `AuthCoreModule` via `auth.public.ts`, but that broadens the public surface — forbidden ("Do not broaden the public surface").
- Therefore `auth-core.module.ts` must stay at the auth root. Splitting the module from its providers (module at root, providers in `core/`) would be awkward and reduce cohesion.
- The existing `tokens/` + `strategy/` split is already a clear sub-organization of the AuthCore framework primitives, and `auth-core.module.ts` composes them from the root. This is the simplest clear organization that respects the boundary.

AuthCore is genuinely useful (it isolates low-level JWT/Passport/cookie infrastructure from the Auth application services) and it remains a useful internal infrastructure boundary. The decision preserves it without creating a second architectural layer for aesthetics. The module comment in `auth-core.module.ts` and `auth.module.ts` already documents this split.

Note: `token-hash.ts` is a pure utility but lives in `tokens/` (not `utils/`) because it is a token primitive belonging to the AuthCore token infrastructure — used exclusively by the token/refresh flow, alongside the other token primitives. Moving it to `utils/` would split a cohesive token infrastructure. `utils/password.util.ts` is a separate concern (password hashing, not token infrastructure) and goes to `utils/`. This gives a clean distinction: `utils/` = general pure helper; `tokens/` = token primitives (services + their pure hash helper).

## 13. Provider organization

The email-delivery provider abstraction is unchanged:
- `ports/email.port.ts` (the `EmailPort` interface + `EMAIL_PORT` token) stays in `ports/`.
- `ports/fake-email.adapter.ts` (dev/test in-memory capture) + `ports/http-email.adapter.ts` (production HTTP provider) stay in `ports/` alongside the port they implement — a cohesive port+adapters group.
- The config-selected binding (`AuthModule` `useFactory` choosing `HttpEmailProviderAdapter` vs `FakeEmailAdapter` by `EMAIL_PROVIDER`) is unchanged.

Email delivery was NOT redesigned. The provider port/tokens remain justified and behaviorally unchanged.

## 14. `auth.public.ts` preservation

`auth.public.ts` remains the intentional TypeScript public entry point for Auth. It is unchanged in shape and surface — still exactly 6 exports:
- `ConsentService` (class)
- `JwtAuthGuard` (class)
- `EmailVerifiedGuard` (class)
- `JwtPayload` (type)
- `AUTH_DELETION_PORT` (const) + `AuthDeletionPort` (type)

The ONLY change inside `auth.public.ts` was one internal path: `export { ConsentService } from './consent.service'` → `'./services/consent.service'` (because `consent.service.ts` moved to `services/`). The other four export paths (`./guards/*`, `./tokens/*`, `./ports/*`) were unchanged because those files did not move. No symbol was renamed, added, or removed. No new public capability was introduced.

All 12 production consumers continue importing through `auth.public.ts` (verified in item 25). No consumer file was modified (their import path `../../auth/auth.public` is unchanged because `auth.public.ts` stayed at the root).

## 15. `AuthModule` / `AuthCoreModule` composition changes

**`AuthModule` (`auth.module.ts`):** stayed at root. 5 internal wiring import paths updated to the new folders:
- `./auth.controller` → `./controllers/auth.controller`
- `./consent.controller` → `./controllers/consent.controller`
- `./auth.service` → `./services/auth.service`
- `./consent.service` → `./services/consent.service`
- `./auth-deletion.service` → `./services/auth-deletion.service`

Unchanged: `./auth-core.module`, `./ports/*` (4), `./guards/*` (2). The `@Module` metadata is identical: same `imports: [AuthCoreModule]`, same `controllers: [AuthController, ConsentController]`, same `providers` (incl. the `EMAIL_PORT` `useFactory` and `AUTH_DELETION_PORT useExisting`), same `exports` (AuthService, ConsentService, JwtAuthGuard, EmailVerifiedGuard, AuthDeletionService, AUTH_DELETION_PORT, EMAIL_PORT). No duplicate provider registration, no broadened public surface.

**`AuthCoreModule` (`auth-core.module.ts`):** unchanged — no edits. It imports `./strategy/jwt.strategy`, `./tokens/jwt-token.service`, `./tokens/refresh-cookie.service` (all stayed), and its `@Module` metadata (PassportModule + JwtModule.registerAsync, providers, exports) is identical.

## 16. Before/after line counts

Move-only: every file keeps its exact line count. Total unchanged at 1315. Max handwritten file is 236 (`auth.service.ts`) — well under the 300-line ceiling. No file was split or extracted.

| File | Before | After | Δ |
|---|---|---|---|
| auth.module.ts | 54 | 54 | stayed (wiring imports updated) |
| auth.public.ts | 5 | 5 | stayed (one internal path updated) |
| auth-core.module.ts | 25 | 25 | stayed (unchanged) |
| auth.controller.ts | 71 | 71 | move → controllers/ |
| consent.controller.ts | 60 | 60 | move → controllers/ |
| auth.service.ts | 236 | 236 | move → services/ |
| consent.service.ts | 190 | 190 | move → services/ |
| auth-deletion.service.ts | 110 | 110 | move → services/ |
| auth.dto.ts | 62 | 62 | move → dto/ |
| consent.dto.ts | 65 | 65 | move → dto/ |
| auth.errors.ts | 26 | 26 | move → constants/ |
| consent.errors.ts | 37 | 37 | move → constants/ |
| password.util.ts | 17 | 17 | move → utils/ |
| guards/jwt-auth.guard.ts | 9 | 9 | stayed |
| guards/email-verified.guard.ts | 28 | 28 | stayed |
| ports/auth-deletion.port.ts | 37 | 37 | stayed |
| ports/email.port.ts | 25 | 25 | stayed |
| ports/fake-email.adapter.ts | 34 | 34 | stayed |
| ports/http-email.adapter.ts | 58 | 58 | stayed |
| strategy/jwt.strategy.ts | 25 | 25 | stayed |
| tokens/jwt-token.service.ts | 62 | 62 | stayed |
| tokens/refresh-cookie.service.ts | 35 | 35 | stayed |
| tokens/token-hash.ts | 44 | 44 | stayed |
| **Total** | **1315** | **1315** | **0** (23 files) |

## 17. Tests reorganized

2 Auth-owned unit tests moved (git-tracked renames) into `tests/unit/auth/` for consistency with the Assessment/Safety test layout (`tests/unit/<module>/`). Kept flat (no subfolders) because there are only 2 files and `email-and-token` spans two source categories (ports + tokens):

| Moved from | Moved to |
|---|---|
| tests/unit/consent-versions.spec.ts | tests/unit/auth/consent-versions.spec.ts |
| tests/unit/email-and-token.spec.ts | tests/unit/auth/email-and-token.spec.ts |

Import rewrites: both got +1 depth (`../../src` → `../../../src`, `../helpers` → `../../helpers`, `../../prisma` → `../../../prisma`) from the move. `consent-versions.spec.ts` additionally got moved-file path updates (`consent.service` → `services/consent.service`, `consent.errors` → `constants/consent.errors`). `email-and-token.spec.ts` imports only staying paths (`ports/fake-email.adapter`, `tokens/token-hash`), so only depth changed.

Cross-module test importers left in place; only the one importing a moved file was updated:
- `tests/contract/consent.contract.spec.ts` — `auth-deletion.service` → `services/auth-deletion.service` (path only; file stays).
- Tests importing only staying paths (`auth.module`, `ports/*`, `tokens/token-hash`, `guards/*`) needed NO change: `auth.contract.spec.ts`, `assessment.contract.spec.ts`, `coaching.contract.spec.ts`, `profile-onboarding.contract.spec.ts`, `safety.contract.spec.ts`, and all the e2e suites (`account-deletion`, `assessment-submit-idempotency`, `isolation`, `redaction-audit`, `resume-restart`, `retention-cleanup`, `safety-routing`).

Note: tests may import Auth internals directly (e.g., `AuthModule`, `EMAIL_PORT`, `FakeEmailAdapter`, `token-hash`, guards) for wiring/stubbing — the Phase 01 boundary constrains production consumers, not tests. No valid test was rewritten; only mechanical import-path updates.

## 18. Unit results

`npx vitest run tests/unit/auth`:

```
Test Files  2 passed (2)
     Tests  17 passed (17)
```

(`consent-versions.spec.ts` + `email-and-token.spec.ts`.) Matches baseline 17/17. All green after the move + import rewrite. (One expected `WARN` log line from the fail-closed `NoticesUnavailableException` test path — not an error.)

## 19. Contract results

| Suite | Result |
|---|---|
| `tests/contract/auth.contract.spec.ts` | 1 file / 16 tests ✅ (matches baseline) |
| `tests/contract/consent.contract.spec.ts` | 1 file / 12 tests ✅ (matches baseline) |

All green. Auth contract covers registration anti-enumeration, verification (token invalid/expired), login (invalid credentials), refresh (rotation/revoke), logout, and the 401/403/410 status codes. Consent contract covers notices, consent status, record consent (idempotent, re-consent, fail-closed), and the `AuthDeletionService` cleanup path.

## 20. Cross-module / e2e regression results

Because Auth is consumed widely (every protected route), representative protected-route coverage was run for each consuming module. All green:

| Module | Suite | Result |
|---|---|---|
| Assessment | `assessment.contract.spec.ts` | 1 file / 22 tests ✅ |
| Assessment | `assessment-submit-idempotency.spec.ts` (e2e) | 1 file / 4 tests ✅ |
| Assessment | `resume-restart.spec.ts` (e2e) | 1 file / 7 tests ✅ |
| Coaching | `coaching.contract.spec.ts` | 1 file / 19 tests ✅ |
| Conversations | `conversation-safety-routing.spec.ts` (unit) | 1 file / 3 tests ✅ |
| Conversations | `conversation-message-send.spec.ts` (unit) | 1 file / 20 tests ✅ |
| Conversations | `conversation-safety.e2e-spec.ts` + `conversation-safety-redaction.e2e-spec.ts` | 2 files / 3 tests ✅ |
| Profile | `profile-onboarding.contract.spec.ts` | 1 file / 25 tests ✅ |
| Safety | `safety.contract.spec.ts` | 1 file / 17 tests ✅ |
| Retention | `account-deletion.spec.ts` (e2e) | 1 file / 4 tests ✅ |
| Retention | `retention-cleanup.spec.ts` (e2e) | 1 file / 8 tests ✅ |

Coverage confirmed: missing/invalid JWT (401), unverified-email (403 EMAIL_NOT_VERIFIED), verified-user behavior, consent gating (403 ONBOARDING_STEP_BLOCKED via the OnboardingGuard consuming `ConsentService` through `auth.public`), and the full account-deletion flow (per-module stores + `AUTH_DELETION_PORT` → `AuthDeletionService`).

**Vitest contention flake (pre-existing harness artifact, not a defect):** when a heavy contract suite (safety 17, assessment 22) runs immediately after another vitest process, the first attempt sometimes reports a dropped count + "1 error" (e.g. safety once showed `10 passed (17) + 1 error`; assessment once showed `19 passed (22) + 1 error` with all 22 tests ✓ in verbose). Re-running the suite alone reliably yields the full clean count (17/17, 22/22). Root cause is resource contention across vitest worker teardown / in-memory Prisma / supertest agents — NOT a code defect, NOT a regression (identical flake observed in the prior Safety + Assessment refactors). Authoritative counts are the clean single-suite runs above.

## 21. Typecheck / build results

- `npx tsc --noEmit -p tsconfig.build.json` → **exit 0**, zero output. Every source import resolves (moved Auth files, `auth.module.ts` wiring, `auth.public.ts`, and all consumers via `auth.public`).
- `npx nest build` → **exit 0**.

## 22. Scoped lint result

`npx eslint src/modules/auth --max-warnings 0` → **exit 0**. Zero Auth lint errors or warnings (including all moved files in `controllers/`, `services/`, `dto/`, `constants/`, `utils/`).

## 23. Project-wide lint result (with unrelated failures separated)

`npx eslint src` → **exit 0**, zero output.

Note: the previously-known pre-existing `no-useless-catch` error in `src/modules/ai/providers/ollama-conversation-llm.provider.ts` (documented in the Safety + Assessment refactor reports) is **no longer present** — that file was modified before this task began (per the initial git status: `M 02-BACKEND/src/modules/ai/ollama-conversation-llm.provider.ts`), resolving the lint error externally. This refactor neither caused nor fixed it; project-wide lint is now fully green.

## 24. `git diff --check` result

`git diff --check` → **exit 0**. The output is entirely `LF will be replaced by CRLF` line-ending normalization warnings (63 lines — a Windows checkout artifact, informational only). No trailing-whitespace, conflict-marker, or whitespace-diff errors.

## 25. Proof that no external production Auth deep imports were reintroduced

Explicit verification after the refactor:

```
# External production deep-imports of Auth subpaths (must be NONE):
$ grep -rn "from ['\"][^'\"]*modules/auth/\(services\|guards\|core\|ports\|utils\|constants\|tokens\|strategy\|dto\|controllers\)" src | grep -v "src/modules/auth/"
( no matches ) — GREP EXIT 1 (clean)

# All external production imports of Auth (only the two root module imports in app.module):
src/app.module.ts:8:import { AuthCoreModule } from './modules/auth/auth-core.module';
src/app.module.ts:9:import { AuthModule } from './modules/auth/auth.module';
```

- **Zero** external production modules deep-import any Auth subpath (`services/`, `guards/`, `core/`, `ports/`, `utils/`, `constants/`, `tokens/`, `strategy/`, `dto/`, `controllers/`).
- The only external production Auth imports are `app.module.ts` importing `AuthCoreModule` + `AuthModule` from the **root** (`./modules/auth/auth-core.module`, `./modules/auth/auth.module`) — these are root-level module-composition imports, not deep subpath imports. `auth-core.module.ts` stayed at the root (Phase 9 decision), so this import is unchanged and is NOT a `auth/core/**` deep import.
- All 12 production consumers (`assessment`, `coaching`, `conversations`, `profile`, `safety`, `retention` controllers + services) import Auth capabilities exclusively through `auth.public.ts`:
  - `JwtAuthGuard`, `EmailVerifiedGuard`, `JwtPayload` → `auth.public` (Assessment, Coaching, Conversations, Profile, Retention, Safety controllers)
  - `ConsentService` → `auth.public` (Assessment onboarding, Coaching eligibility, Profile, Safety services)
  - `AUTH_DELETION_PORT`, `AuthDeletionPort` → `auth.public` (Retention services)

Boundary Hardening Phase 01 remains fully valid. No new public capability was added; no new port was introduced; `auth.public.ts` is still the sole public entry point.

## 26. Confirmation that no Auth behavior changed

This was a **move-only** refactor (no extraction, no split, no code-body change to any production file — only import paths, module wiring, and one internal path in `auth.public.ts`). Confirmation by behavior:

- **Registration / resend** — anti-enumeration (identical ack whether or not the account exists; no delivery-status disclosure), hashed verification tokens, fail-without-enumeration error handling. `auth.service.ts` body byte-for-byte unchanged. Auth contract green.
- **Email verification** — single-use 24h token, `TOKEN_INVALID` (400) / `TOKEN_EXPIRED_OR_USED` (410), atomic `consume + status→EMAIL_VERIFIED` transaction, redirect to `/onboarding/boundary`. Unchanged. Auth contract green.
- **Login** — indistinguishable unknown-email vs wrong-password (`INVALID_CREDENTIALS` 401), argon2 verify via `password.util`, access + refresh issuance, `lastActivityAt` update, placeholder profile. Unchanged.
- **JWT issuance/verification** — `JwtTokenService.issueAccessToken`/`issueRefreshToken`/`verifyAccessToken`/`verifyRefreshToken`, access/refresh secrets + TTLs from config. Unchanged (tokens/ stayed).
- **JwtPayload** — `{ sub, email, status, iat?, exp? }`. Unchanged; still exported via `auth.public.ts`.
- **Refresh** — cookie read, `verifyRefreshToken`, hashed-row lookup, revoke-prior + issue-new rotation, `INVALID_CREDENTIALS` on any failure. Unchanged.
- **Refresh cookies** — `RefreshCookieService` HttpOnly/Secure/SameSite=strict/path=`/api/v1/auth`/maxAge; `REFRESH_COOKIE_NAME='priora_refresh'`. Unchanged (tokens/ stayed).
- **Password hashing** — argon2id `hashPassword`/`verifyPassword` (malformed hash → never accept). Unchanged (utils/password.util).
- **Logout** — revoke active refresh row, clear cookie. Unchanged.
- **Consent** — fail-closed `NOTICES_UNAVAILABLE` (503), re-consent `RECONSENT_REQUIRED` (409) with current versions, `ACKNOWLEDGMENTS_INCOMPLETE` (400), idempotent same-version retry returns existing record, record holds only version ids + language + channel + timestamps. `consent.service.ts` body unchanged. Consent contract + consent-versions unit green.
- **Consent versions / eligibility** — `hasGrantedCurrentConsent` (fail-closed → false), `getConsentStatus` (has_granted/requires_reconsent). Unchanged. Profile-onboarding contract (25, exercises the OnboardingGuard consuming `ConsentService` via `auth.public`) green.
- **JwtAuthGuard** — Passport 'jwt' strategy, 401 on missing/invalid token. Unchanged.
- **EmailVerifiedGuard** — 403 `EMAIL_NOT_VERIFIED` for REGISTERED users. Unchanged. Cross-module contracts (Assessment 22, Coaching 19, Safety 17, Profile 25) all verify the 401/403 behavior.
- **Deletion** — `deleteExpired` (unverified + pre-consent accounts, two-step pre-consent exclusion), `deleteConsentForUsers`, `deleteAccountForUsers` (called last, idempotent, cascades tokens). `auth-deletion.service.ts` body unchanged. Retention e2e (account-deletion 4, retention-cleanup 8) green.
- **Email delivery** — `EMAIL_PORT` config-selected binding (`FakeEmailAdapter` vs `HttpEmailProviderAdapter`), anti-enumeration on delivery failure. Unchanged. Auth contract (verification email capture) green.
- **HTTP routes / DTOs / Prisma schema** — no route, DTO contract, Zod rule, status code, or Prisma schema change.

**Constraints honored:** No public APIs, registration/login/logout/refresh/verification behavior, JWT, JwtPayload, cookies, password hashing, consent versions/acceptance/eligibility, guards, 401/403 behavior, deletion behavior, email delivery, idempotency, HTTP routes, HTTP DTOs, or Prisma schema were changed. The Auth public surface was not broadened. No new port was introduced. No repositories were introduced. No Auth behavior was changed.

## 27. Remaining structural issues intentionally deferred

These are NOT fixed by this structural refactor; they are documented for future phases (Boundary Hardening / ownership hardening). The refactor only ensured the moves did not worsen them.

1. **Direct Prisma access in Auth services.** `auth.service`, `consent.service`, `auth-deletion.service` all access Prisma directly. No repository abstraction introduced (Phase 5). Persistence ownership can be revisited in a future Auth ownership-hardening phase.
2. **`app.module.ts` imports `AuthCoreModule` directly** (not via `auth.public`). This is the composition root wiring the JWT/Passport framework app-wide and is NOT a Phase 01 boundary violation (it imports the module class from the root, not a deep subpath). If `AuthCoreModule` were ever to be exported via `auth.public`, that would broaden the public surface — deliberately left as-is. Noted for completeness.
3. **`tokens/` is a mixed folder** (2 injectable services + 1 pure util `token-hash.ts`). Intentional: `token-hash` is a token primitive belonging to the AuthCore token infrastructure. Not a defect; the alternative (moving `token-hash` to `utils/`) would split a cohesive token infrastructure. Documented as a deliberate choice (item 12).
4. **`ConsentController` route base is `/onboarding`** while living in the Auth module. Intentional (Auth owns `ConsentRecord`; the path is `/onboarding/*` by design). Unchanged.
5. **`utils/password.util.ts` is a single-file `utils/` folder.** Justified — it is a genuinely pure stateless helper (argon2), the directive's explicit `utils/` case. Not over-organization.
6. **`auth.public.ts` is untracked in git** (created by Boundary Phase 01, not yet committed). This is a commit-state matter for the user, not a structural issue; the file is correct and functional (tsc + all tests green). No action taken (commits are the user's decision).
7. **Cross-module boundary hardening (Assessment/Conversations deep-importing Safety, etc.)** — out of scope for this Auth task; untouched.

---

## Stop point

Auth Module structural refactor complete. Stopping per directive. Safety Boundary Hardening Phase 02, AI Boundary Hardening, Retrieval consolidation, Profile ownership hardening, Assessment lifecycle ownership hardening, and Retention ownership hardening have NOT been begun. Awaiting review.