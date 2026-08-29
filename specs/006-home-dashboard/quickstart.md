# Quickstart: Post-Onboarding Home Dashboard

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This feature is **frontend-only**. No backend, database, or Python/RAG service needs to run for the Home Dashboard itself, but the backend must be reachable for the consumed coaching and conversation APIs.

## Prerequisites

- Node.js and **npm** (the repo uses a root `package-lock.json`).
- The Priora Mind backend running (`02-BACKEND`) for live API responses, OR the frontend test suite (Playwright e2e, which mocks/stubs API responses).
- Environment: `NEXT_PUBLIC_API_BASE_URL` pointing at the backend (defaults to `http://localhost:3000` per `api-client.ts`).

## Install & run the frontend

From the repo root:

```bash
cd 03-FRONTEND
npm install
npm run dev          # start the Next.js dev server (port 3001)
```

**One-time setup: shadcn/ui (AD-8).** Spec 006 initializes shadcn/ui once — `npx shadcn@latest init` (adds `components.json` + `src/lib/utils.ts` `cn`), then `npx shadcn@latest add button card` for the primitives the new Home files use. Configure tokens to match the existing palette (slate, `rounded-3xl`/`rounded-full`, `text-start`, `focus-visible:ring`). Do **not** migrate existing `features/chat/*` or `features/coaching/*` — they keep raw Tailwind.

Open the app in both locales to verify en + ar/RTL:

- English: `http://localhost:3001/en/dashboard`
- Arabic:  `http://localhost:3001/ar/dashboard`

## Verify the Home Dashboard per state

Log in / seed a user in each coaching state and open `/dashboard`:

| State | How to reproduce | Expected Home Dashboard |
|---|---|---|
| `firstRun` | Freshly onboarded user, no plan, no conversations | First-run wording ("generate your first coaching plan" + "start your first conversation"); the auto-start effect fires immediately (the **single** generation flow — AD-7), so the visible state transitions `startable`→`starting`→`pending`/`generating`; no error messaging (FR-002a) |
| `startable` | No plan **and** ≥1 conversation | No-plan card + start action (auto-start effect may immediately transition to `starting`) |
| `pending` / `generating` | Plan with `generationStatus` PENDING/GENERATING | Generating state, no CTA, polls only while PENDING/GENERATING (FR-011) |
| `readyProposed` | `READY` + `planStatus` PROPOSED | Plan summary + "accept your plan" CTA + open plan view |
| `readyActive` | `READY` + ACTIVE | Plan progress + "continue your plan" CTA |
| `readyCompleted` | `READY` + COMPLETED | "review your completed plan" wording; **no** new-plan CTA; continue-chat offered (FR-010a) |
| `failedRetryable` | `PLAN_UNAVAILABLE` with `retryable: true` | Failed card + explicit "try again"; no auto-retry, no polling (FR-007, FR-008) |
| `unavailable` | `PLAN_UNAVAILABLE` with `retryable: false` (not currently reachable; retained) | Unavailable card, no retry, no polling |
| `noAssessment` | `RESULT_NOT_FOUND` | Existing no-assessment guidance, no start action (FR-015) |
| `safetyHold` | `SAFETY_HOLD` | Redirects to `/safety/hold` (existing) |
| `ineligible` | `ONBOARDING_STEP_BLOCKED` | Redirects to the unfinished onboarding step (existing) |

## Verify chat integration

- **Continue chat**: with ≥1 active conversation, the continue-chat card targets the most-recently-updated active conversation; clicking it navigates to `/chat/{id}`; refresh stays in the same conversation (SC-005).
- **Start new conversation**: "start a new conversation" creates a conversation and navigates to its URL (SC-006).
- **Open conversations**: the "open conversations" action navigates to the existing chat view with the conversation-list sidebar (FR-018).
- **Top-level nav**: the `TopNav` affordance moves between Home (`/dashboard`), Plan (`/dashboard#coaching-plan`), and Chat (`/chat`) (SC-007). The plan region is always wrapped in a synchronous `<section id="coaching-plan">`, and `HomeDashboardView` scrolls to it on hash change, so the Plan anchor is reliable (AD-5).
- **Plan exists, no conversations**: the plan region renders normally and the chat region shows a "start your first conversation" prompt — not an error (FR-002b).
- **Partial-failure isolation (AD-9)**: with the coaching query succeeding and the conversations query failing, the plan region still renders and the chat region shows its own error + retry (and vice-versa) — one region's failure never hides the other.

## Run the tests

The frontend has **only Playwright** (no Vitest/Jest/RTL is configured). From `03-FRONTEND`:

```bash
# Home Dashboard state logic + journeys
npx playwright test e2e/home-dashboard-state.spec.ts
npx playwright test e2e/home-dashboard.spec.ts

# Regression: ensure Spec 004/005 tests still pass unchanged
npx playwright test e2e/coaching-plan.spec.ts e2e/coaching-dashboard-state.spec.ts
```

New test files (all Playwright e2e — the repo's only configured runner):

- `tests/e2e/home-dashboard-state.spec.ts` — coverage for `resolveHomeDashboardView` (including `firstRun` **not** asserted while conversations is loading/errored), `resolvePrimaryAction`, `selectContinueChatTarget` (mirrors the existing `coaching-dashboard-state.spec.ts` e2e style).
- `tests/e2e/home-dashboard.spec.ts` — first-run, ready-active, completed, continue-chat, start-new, top-nav, partial-failure isolation, Plan-anchor scroll, RTL.

## Quality gates (Definition of Done)

```bash
npm run lint                    # ESLint
npx tsc --noEmit                # type check (03-FRONTEND + shared)
npm run build                   # next build
npx playwright test             # all e2e (Playwright is the only test runner)
```

- Every new handwritten file ≤ 300 lines (Constitution VIII).
- No imports from RAG/LLM/Qdrant/Python services in `features/home` (SC-010, SC-012):
  ```bash
  grep -rniE "rag|qdrant|ollama|openai|llm|python" 03-FRONTEND/src/features/home
  # expected: no matches
  ```
- No local persistence added:
  ```bash
  grep -rniE "localStorage|sessionStorage|indexedDB" 03-FRONTEND/src/features/home
  # expected: no matches
  ```
- Spec 004/005 source untouched (AD-0, FR-030):
  ```bash
  git diff --stat -- 03-FRONTEND/src/features/chat 03-FRONTEND/src/features/coaching
  # expected: no changes under features/chat or features/coaching
  # (chat page files are NOT moved and NOT edited; TopNav reaches chat via sibling chat/layout.tsx composing <AppShell/>)
  ```
- `AppShell` scoped to the Home/Plan/Chat boundary (FR-022a, AD-11):
  ```bash
  grep -rn "AppShell" 03-FRONTEND/src/app
  # expected: only dashboard/layout.tsx and chat/layout.tsx compose <AppShell>
  grep -rn "TopNav" 03-FRONTEND/src/features/home
  # expected: only app-shell.tsx renders <TopNav/> (the single mount point of the shared chrome)
  ```
  Confirm no chat/dashboard page file was moved or import-rewritten (`git diff` shows no edits under `app/[locale]/(protected)/chat/**/page.tsx`).
  And an e2e visit asserts `TopNav` is absent on `/assessment` (and other non-home protected routes).
- Existing `coaching-plan.spec.ts` and chat e2e pass unchanged (SC-011).