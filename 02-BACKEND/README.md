# @priora/backend

NestJS modular monolith backend for Priora Mind — Feature 001 (user onboarding & assessment).

## Stack

NestJS 10 · Prisma (PostgreSQL) · Zod · `@nestjs/jwt` + Passport · Argon2id · `@nestjs/schedule` · OpenTelemetry · Auth-owned `EmailPort`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run start:dev` | Watch-mode dev server (prefix `/api/v1`, port `PORT` or 3000) |
| `npm run build` | Compile via `nest build` |
| `npm test` | Vitest unit + contract tests |
| `npm run test:e2e` | Vitest e2e (NestJS app + supertest) |
| `npm run prisma:migrate` | Create/apply migrations |
| `npm run prisma:seed` | Seed reference content (NoticeVersionSet, definitions) |

## Layout (target — see plan.md)

```
src/
  modules/   auth/ · profile/ · assessment/ · safety/ · retention/
  common/    redact.ts · filters/ · config/
  main.ts    app.module.ts
prisma/      schema.prisma · migrations/
tests/       unit/ · contract/ · e2e/
```

Domain modules are added per user story (US1–US9). At Setup, only the health check + config + scheduler skeleton boot.