# @priora/frontend

Next.js (App Router) frontend for Priora Mind — Feature 001 (user onboarding & assessment).

## Stack

Next.js 14 · React 18 · Tailwind CSS · shadcn/ui · React Hook Form · Zod · TanStack Query · next-intl (AR + EN, RTL/LTR).

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server on port 3001 |
| `npm run build` | Production build |
| `npm run lint` | `next lint` |
| `npm test` | Playwright e2e |

## Layout (target — see plan.md)

```
src/
  app/            (public)/register · (public)/verify-email · (protected)/onboarding/* · /assessment/* · /safety/hold · /dashboard
  features/       auth · onboarding · assessment · safety
  components/     shadcn/ui + app components
  services/       API service layer (no direct fetch in components)
  hooks/          React Query hooks
  lib/            utils, api client
  i18n/           next-intl catalogs + config
tests/e2e/        Playwright (full journey, RTL, safety routing)
```

At Setup, only the root layout + landing page render. Route groups, the API
service layer, and feature catalogs are added per user story (US1–US9).