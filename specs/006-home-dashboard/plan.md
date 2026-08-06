# Implementation Plan: Post-Onboarding Home Dashboard

**Branch**: `006-home-dashboard` | **Date**: 2026-08-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-home-dashboard/spec.md`

## Summary

Spec 006 converts the existing `/dashboard` route from a single coaching-plan view into the **Home Dashboard** — the primary authenticated post-onboarding landing page and central hub connecting the coaching plan, the chatbot, the recommended next action, and recent activity.

The technical approach is **maximal reuse with a thin orchestration layer**: the existing coaching-plan state machine (`resolveDashboardView`, `useCoachingPlanQuery`, the start/accept/update-action mutations, and `CoachingPlanView`) and the existing chat capabilities (`useConversationListQuery`, `useCreateConversationMutation`, `conversationApi`) are consumed **unchanged** — no Spec 005 file is edited. A new small `features/home` feature module adds only the surrounding Home Dashboard shell — a composite-state resolver (adding the `first-run` and plan-exists-no-conversations UX states), a deterministic primary-CTA resolver (FR-035), a continue-chat target selector, a read-only recent-conversations region fed by a **dedicated** `getRecentConversations(limit)` helper (the existing `conversationApi.list` is left untouched), and a consistent top-level navigation affordance (FR-022a): two **co-located per-route layouts** (`dashboard/layout.tsx` and `chat/layout.tsx`) compose a single shared `AppShell` that mounts `TopNav` and owns the shared chrome for the Home / Plan / Chat boundary. This uses the existing routing structure as-is — no chat pages are moved, no import paths change, and the nav is scoped to exactly the Home / Coaching Plan / Chat routes, so it never appears on Profile, Assessment, Onboarding, Safety, or future protected pages.

No backend, DTO, database, lifecycle, polling, persistence, RAG/LLM, streaming, or analytics changes. There is exactly **one** plan-generation flow — the existing Spec 002 auto-start-on-no-plan behavior, preserved unchanged. The bounded retry/poll policy, URL-based conversation recovery (Spec 005), and safety/eligibility routing are preserved exactly. shadcn/ui is adopted incrementally (initialized once, used only by new Home files; no migration of existing Chat/Coaching components).

**Home is strictly an orchestration layer over Coaching and Chat.** It composes their existing hooks, queries, mutations, components, and state, and creates new code only where orchestration or presentation is required — it never duplicates implementation owned by Coaching or Chat (AD-0).

## Technical Context

**Language/Version**: TypeScript 5.9, React 19, Next.js 16 (App Router) with `[locale]` dynamic segment.

**Primary Dependencies**: TanStack Query v5 (server state), next-intl v4 (en/ar + RTL), Tailwind CSS v3, `@priora/shared-types` (cross-stack DTOs), React Hook Form + Zod (not used by this feature). shadcn/ui is **intended but not yet initialized** — the runtime deps (`@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`) are present, but there is no `components.json` and no `components/ui/`. Spec 006 initializes it once and adopts it incrementally (see AD-8).

**Storage**: N/A — no persistence is added. Backend responses remain authoritative (FR-025). Access token stays in memory via the existing `api-client.ts`; no new token storage.

**Testing**: Playwright (e2e) — the **only** configured test runner (`@playwright/test`; `tests/e2e/*`). No unit/component runner (Vitest/Jest/RTL) is present, and **none is introduced** (no-new-testing-framework constraint). Pure state logic is kept framework-free so it is exercised through Playwright routes, mirroring the existing `tests/e2e/coaching-dashboard-state.spec.ts` (an e2e file, not a unit file).

**Target Platform**: Web (Next.js), desktop + mobile viewports, LTR and RTL.

**Project Type**: Web application frontend (feature-first).

**Performance Goals**: Home Dashboard initial render is driven by the existing coaching-plan query plus one new bounded recent-conversations request (`getRecentConversations(HOME_RECENT_CONVERSATIONS_LIMIT)` where `HOME_RECENT_CONVERSATIONS_LIMIT = 5`) to the existing conversations endpoint — no new endpoint, no over-fetching (FR-023). No polling is added beyond the existing coaching-plan poll-while-pending behavior.

**Constraints**: Handwritten files ≤ 300 lines; no new backend APIs/DTOs/lifecycle states; no direct RAG/LLM/Qdrant/Python; no streaming, summaries, analytics, notifications, achievements, or AI recommendations; no local persistence; preserve Spec 004/005 behavior.

**Scale/Scope**: One route reworked (`/dashboard`), one shared layout chrome addition, one new feature module (`features/home`, ~5 files), i18n additions, tests. No backend surface touched.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Coaching, Not Clinical (NON-NEGOTIABLE) | ✅ Pass | Home Dashboard is read-and-navigate only; all coaching/safety decisions deferred to existing backend. No clinical copy invented. |
| II. Safety Before Coaching (NON-NEGOTIABLE) | ✅ Pass | Reuses existing safety-hold routing (`SAFETY_HOLD` → `/safety/hold`) and eligibility redirect (`ONBOARDING_STEP_BLOCKED`). No new safety logic, risk levels, or copy (FR-013–FR-016). Safety-held/ineligible users get no coaching CTA. |
| III. Evidence-Grounded AI | ✅ Pass (N/A) | Home Dashboard calls no AI/RAG directly (FR-022, SC-010). |
| IV. Domain Ownership | ✅ Pass | No business state written by the UI. Plan accept/update reuse existing coaching endpoints; the UI owns no domain decisions. |
| V. Structured Coaching Experience | ✅ Pass | Surfaces existing plan lifecycle; adds no open-ended engagement loops. |
| VI. Privacy, Data Isolation (NON-NEGOTIABLE) | ✅ Pass | No local persistence (FR-025); no sensitive content logged; reuses in-memory token storage; route guards remain UX-only. |
| VII. Explicit & Limited Context | ✅ Pass (N/A) | No AI context constructed by this feature. |
| VIII. Clean, Modular Code (NON-NEGOTIABLE) | ✅ Pass | Feature-first `features/home`; pure state functions separated from presentation; each file ≤ 300 lines; no god components; reuse over duplication. |
| IX. Testing & Verifiable Behavior | ✅ Pass | Playwright e2e (the repo's only configured runner) covers pure state logic via routes (mirroring `coaching-dashboard-state.spec.ts`), per-state rendering, journeys, partial-failure, and Arabic/RTL; regression guard for Spec 004/005 tests. No new test framework introduced. |
| X. Arabic & English Quality Equality | ✅ Pass | All new copy in both `en.json` and `ar.json`; RTL verified by test, not just `dir` attribute (FR-028). |
| XI. Authoritative References | ✅ Pass | Reference Alignment section below; no contradictions with PRD/SAD/Frontend_Architecture. |
| XII. MVP Simplicity | ✅ Pass | No new abstractions beyond the single clear responsibility (Home Dashboard shell); no speculative features (FR-031, FR-034). |

**Gate result**: PASS — no violations to justify. No `Complexity Tracking` entries required.

## Reference Alignment

- **PRD.md**: Aligns with the core journey (generate plan → engage → chat → review) by making that journey navigable from one hub. Respects non-goals (no diagnosis, medication, voice, payments, therapist marketplace) and principles (safety before coaching, privacy first). Invents no analytics or recommendation data.
- **SAD.md**: Aligns with the modular-monolith ownership model. Coaching-plan lifecycle (two-status `generationStatus`/`planStatus`) remains Coaching-owned; safety classification remains Safety-owned; the frontend calls no RAG/Qdrant/LLM directly (FR-022, SC-010). `FAILED` is mapped to a Home Dashboard *display* state, never introduced as a plan lifecycle state (FR-004). No new backend entities, lifecycle states, or safety logic.
- **Frontend_Architecture.md**: Aligns with feature-first structure (new `features/home` reusing `features/coaching` and `features/chat`), API-only-through-service-layer (no direct `fetch` from components), TanStack Query for server state, existing design-system components, and en/ar + RTL setup. The documented `/dashboard` route is extended from "coaching-plan experience" into the Home Dashboard without changing the protected-route guard chain or the `/chat` and `/chat/[conversationId]` routes (FR-030).
- **Conflicts / Gaps**:
  1. **No dedicated coaching-plan route.** Frontend_Architecture §7 lists `/dashboard` as the coaching-plan experience and `/plans`/`/plans/:id` as *future* (out of MVP). FR-022a references a "plan-view route", but no separate plan route exists today — the plan is rendered inside `/dashboard`. **Resolution (no new route):** the top-level nav "Plan" affordance links to `/dashboard` and focuses/scrolls to the plan region (anchor `#coaching-plan`). This reuses the existing `/dashboard` route and honors "no new routes". Flagged as a repository gap below.
  2. **Recent-conversations query without disturbing Spec 005.** The existing `conversationApi.list(includeArchived)` calls `GET /conversations?includeArchived=…` without a `limit`, and is consumed by the Spec 005 chat sidebar. The backend already supports a bounded `limit` query parameter (per spec Assumptions). **Resolution (preserve Spec 005):** do **not** change `list()`'s signature or behavior. Add a dedicated `features/home/home.api.ts` helper `getRecentConversations(limit)` that calls the same existing endpoint with `includeArchived=false&limit=${limit}` via the shared `apiFetch`. No `features/chat/*` file is edited; no existing consumer is affected.
  3. **Auto-start-on-no-plan vs. explicit start action.** The current dashboard auto-starts generation on `PLAN_NOT_FOUND` (Spec 002 behavior). The spec's `startable`/`first-run` states with an explicit "start" action therefore render transiently before auto-start fires. **Resolution (preserve Spec 002):** keep the auto-start effect unchanged in the page; the explicit start/retry actions remain for the `failed-retryable` case and any frame before auto-start fires. Documented in spec Assumptions; no Spec 002 modification.
  4. **Scoping the top-level nav to the Home/Plan/Chat experience.** The `(protected)` route group currently contains `dashboard`, `chat`, `assessment`, `onboarding`, and `safety`. Placing `TopNav` in the global `(protected)/layout.tsx` would render Home/Plan/Chat navigation on Assessment, Onboarding, and Safety pages, where it is irrelevant. **Resolution (co-located per-route layouts + shared `AppShell`, no relocation):** add a `dashboard/layout.tsx` and a `chat/layout.tsx`, each composing the single shared `<AppShell>{children}</AppShell>` (AD-11), which mounts `<TopNav/>`. App Router layouts automatically wrap every nested segment, so `chat/layout.tsx` covers both `/chat` and `/chat/[conversationId]`. This uses the existing routing structure as-is — **no chat pages are moved, no import paths change, and no existing `page.tsx` is edited** (each layout is a new sibling file that wraps its page). URLs and Spec 005 behavior (routes, URL recovery, message handling, conversation-list sidebar) are unchanged; the only addition is the surrounding `TopNav` chrome (now factored into `AppShell`), which is exactly what FR-022a requires and FR-030 permits. Assessment/Onboarding/Safety have no such layout and therefore do not get the nav. The existing chat header `backToPlan` link (FR-021) is left intact. (A nested `(home)` route group was considered and rejected — see Architecture Decision 5 and research R4.)

## Project Structure

### Documentation (this feature)

```text
specs/006-home-dashboard/
├── plan.md                      # This file
├── research.md                  # Phase 0 output
├── data-model.md                # Phase 1 output (frontend-only state model)
├── quickstart.md                # Phase 1 output (run/verify instructions)
├── contracts/
│   ├── consumed-api.md          # Existing endpoints reused (no new contracts)
│   └── frontend-state-contract.md # HomeDashboardState + primary-action mapping
└── checklists/
    └── requirements.md          # Spec quality checklist (already present)
```

### Source Code (repository root)

```text
03-FRONTEND/src/
├── app/[locale]/(protected)/
│   ├── layout.tsx                         # UNCHANGED — RequireAuth wrapper (no TopNav here)
│   ├── dashboard/
│   │   ├── layout.tsx                     # NEW — co-located layout: composes <AppShell>{children}</AppShell> (FR-022a, AD-11)
│   │   └── page.tsx                       # MODIFIED (in place) — render HomeDashboardView
│   ├── chat/
│   │   ├── layout.tsx                     # NEW — co-located layout: composes <AppShell>{children}</AppShell> (covers /chat and /chat/[id]; AD-11)
│   │   ├── page.tsx                       # UNCHANGED — not moved, not edited (Spec 005 preserved)
│   │   └── [conversationId]/page.tsx      # UNCHANGED — not moved, not edited (Spec 005 preserved)
│   ├── assessment/                        # UNCHANGED — no TopNav
│   ├── onboarding/                        # UNCHANGED — no TopNav
│   └── safety/                            # UNCHANGED — no TopNav
├── features/
│   ├── home/                              # NEW feature module (orchestration layer)
│   │   ├── home-dashboard-state.ts        # NEW — HomeDashboardState + resolveHomeDashboardView (pure state derivation)
│   │   ├── home-primary-action.ts         # NEW — PrimaryAction + resolvePrimaryAction (FR-035 rule, pure)
│   │   ├── home-chat.ts                   # NEW — selectContinueChatTarget (FR-017 target, pure)
│   │   ├── home.api.ts                    # NEW — getRecentConversations(limit) + HOME_RECENT_CONVERSATIONS_LIMIT (reuses existing endpoint)
│   │   ├── home-hooks.ts                  # NEW — useRecentConversationsQuery(limit)
│   │   ├── home-dashboard-view.tsx        # NEW — orchestrator
│   │   ├── home-plan-region.tsx           # NEW — coaching status region (reuses CoachingPlanView)
│   │   ├── home-chat-region.tsx           # NEW — continue-chat + start-new + recent list
│   │   ├── app-shell.tsx                  # NEW — shared chrome for the Home/Plan/Chat boundary (mounts TopNav)
│   │   └── home-top-nav.tsx               # NEW — the top-level nav component (rendered by AppShell)
│   ├── chat/                              # UNCHANGED — no file edited (Spec 005 preserved)
│   └── coaching/                          # REUSE unchanged
├── i18n/messages/
│   ├── en.json                            # MODIFY — add `home` + `nav` keys
│   └── ar.json                            # MODIFY — add `home` + `nav` keys
└── tests/
    └── e2e/
        ├── home-dashboard-state.spec.ts   # NEW — state/CTA/target logic via Playwright (mirrors coaching-dashboard-state.spec.ts)
        └── home-dashboard.spec.ts         # NEW — home dashboard journeys (Playwright)
```

**Structure Decision**: Feature-first, matching the existing `features/coaching` and `features/chat` convention. The new `features/home` module owns the Home Dashboard shell and its presentation-only state; it **consumes** `features/coaching` and `features/chat` but does not duplicate their logic. State logic is isolated in pure, framework-free modules — `home-dashboard-state.ts` (state derivation), `home-primary-action.ts` (the FR-035 primary-action rule), `home-chat.ts` (the FR-017 chat-target rule) — so each is trivially testable and contains no business/domain rules (Constitution VIII). The shared layout chrome is centralized in `app-shell.tsx`, composed by the two co-located layouts.

## Architecture Decisions

0. **The Home Dashboard is an orchestration layer, not a replacement implementation (governing rule).** The Home Dashboard MUST compose the existing Coaching and Chat features; it MUST NOT duplicate them. **Home owns no Coaching or Chat implementation**: it composes existing hooks, queries, mutations, components, and state from `features/coaching` and `features/chat`, and creates new code **only** where orchestration or presentation is required (the shell, the composite-state derivation, the primary-CTA rule, the continue-chat target selection, the read-only recent list, and the top-level nav). The following MUST NOT be recreated, re-implemented, or shadowed in `features/home`:
   - the **coaching state machine** (`resolveDashboardView`, the `CoachingDashboardView` set, `shouldPollPlan`, `shouldRetryPlanQuery`);
   - `CoachingPlanView` and its accept / continue-chat / action-step controls;
   - **conversation logic** (server-side `updatedAt desc, id desc` ordering, active/archived filtering, URL-based recovery);
   - **chat state handling** (`mapMessageState`, message routing, idempotency);
   - the Spec 005 conversation-list sidebar (archive/delete/select actions);
   - **existing mutations** (`useStartGenerationMutation`, `useAcceptPlanMutation`, `useUpdateActionStatusMutation`, `useCreateConversationMutation`) and their invalidation behavior;
   - **existing polling** (`useCoachingPlanQuery`'s `refetchInterval` / `shouldPollPlan`, 1500 ms, `MAX_TRANSIENT_RETRIES = 2`);
   - **existing routing behavior** (URL-based conversation recovery, `routeForStep`, safety/eligibility redirects).
   The Home Dashboard imports and reuses these; it does not re-implement them. This rule is enforced in code review and in the testing strategy (regression tests confirm Spec 004/005 behavior is unchanged).
1. **Composite state derived, not stored.** `HomeDashboardState` is a pure function of the existing `CoachingDashboardView` **plus the recent-conversations query status** (loading / success-empty / success-non-empty / error) — not merely an active-conversation count. `firstRun` is the composite `startable` (no plan) + conversations query **success** + zero active conversations; while the conversations query is loading or errored, `firstRun` is **not** asserted (see AD-9). `firstRun` is **not** a coaching lifecycle state (FR-004). No state is persisted (FR-025).
2. **Primary CTA is a pure frontend rule, rendered without duplicating `CoachingPlanView` (FR-035, FR-036a).** `resolvePrimaryAction(state)` returns the single dominant action or `none`. The mapping lives in the focused `home-primary-action.ts` module (separated from state derivation — see AD-10) and introduces no backend field. **Rendering rule:** a Home-level primary CTA *button* is rendered **only** for non-READY actionable states — `firstRun`/`startable` (`generate-first-plan`/`generate-plan`) and `failedRetryable` (`retry`) — where `CoachingPlanView` is not shown. For READY states (`readyProposed`/`readyActive`/`readyCompleted`), **no Home-level CTA button is rendered**; `CoachingPlanView`'s own built-in action (the dominant accept button for PROPOSED; the continue-chat button and action-step controls for ACTIVE/COMPLETED) IS the single primary action. For READY states the `PrimaryAction` value drives only a short **guidance label** ("Next: accept your plan" / "Next: continue your plan" / "Next: review your completed plan"), never a duplicate button. This eliminates the duplicate/competing accept action without modifying `CoachingPlanView`. (A `presentation` mode prop for `CoachingPlanView` was considered and rejected as unnecessary — not rendering a duplicate CTA is sufficient and avoids touching a Spec 004 component.)
3. **Deterministic continue-chat target.** The active (non-archived) conversation list is already sorted newest-by-last-update server-side (`updatedAt desc, id desc`). The target is `items[0]` — the greatest last-update timestamp, ties broken by the backend's fixed secondary ordering. No client-side sorting or "latest" ambiguity (FR-017).
4. **Reuse `CoachingPlanView` verbatim for READY states; no competing Home CTA.** The plan region delegates to the existing `<CoachingPlanView/>` for `readyProposed`/`readyActive`/`readyCompleted`, threading the same props the current dashboard threads. `CoachingPlanView` is **not modified** (no presentation-mode prop, no Spec 004 edit). The plan region renders **no** Home-level primary CTA button for READY states — `CoachingPlanView`'s own accept / continue-chat / action controls are the primary action (AD-2). Non-ready states render compact state cards using the existing `StateCard` pattern extracted from the current dashboard page, plus the single Home-level CTA button where `PrimaryAction` is `generate-first-plan`/`generate-plan`/`retry`. The completed state uses "review your completed plan" wording and offers no new-plan action (FR-010a).
5. **Top-level nav via co-located per-route layouts; reliable in-page Plan anchor.** The two co-located layout files (`app/[locale]/(protected)/dashboard/layout.tsx` and `app/[locale]/(protected)/chat/layout.tsx`) compose a single shared `AppShell` (AD-11) that renders `<TopNav/>` above `{children}`. App Router layouts wrap every nested segment automatically, so `chat/layout.tsx` covers both `/chat` and `/chat/[conversationId]`. This scopes the nav to exactly the Home / Coaching Plan / Chat routes (FR-022a) while keeping it off Assessment, Onboarding, Safety, Profile, Settings, and future protected pages. It uses the existing routing structure as-is: **no chat pages are moved, no import paths change, and no existing `page.tsx` is edited** — each layout is a new sibling file. It reuses only existing routes (`/dashboard`, `/chat`) and an in-page anchor for the plan region (no new route). The global `(protected)/layout.tsx` is left unchanged. A nested `(home)` route group was considered and rejected as an unnecessary mechanical move (see research R4).
   - **Active destination (FR-022a).** `TopNav` is a client component. Active state is derived from `usePathname()` plus the URL hash: Home is active when `pathname === '/dashboard'` and the hash is not `#coaching-plan`; Chat is active when `pathname` starts with `/chat`; Plan is active when `pathname === '/dashboard'` and the hash is `#coaching-plan`. The hash is read in a client effect (`window.location.hash`) and kept in state, since `usePathname` does not include it.
   - **Plan anchor reliability.** The Plan link is `/dashboard#coaching-plan`. The plan region is wrapped in `<section id="coaching-plan">` that is **always rendered synchronously for every Home Dashboard state** (including no-plan, generating, failed, and error states) — the wrapper is not async-dependent, so the anchor target exists from first paint regardless of whether the coaching query has resolved. Because Next.js client-side navigations do not always trigger the browser's native hash scroll, `HomeDashboardView` mounts a `useEffect` that, on hash change (and on initial mount when a hash is present), calls `document.getElementById('coaching-plan')?.scrollIntoView({ behavior: 'smooth' })`. Reliability therefore does not rely on the browser default alone.
6. **Recent conversations via a dedicated helper that leaves `conversationApi.list` untouched; verified invalidation; deterministic limit; no polling.** Add `features/home/home.api.ts` exporting `getRecentConversations(limit)`, which calls the existing `GET /conversations?includeArchived=false&limit=${limit}` endpoint through the shared `apiFetch` (same auth/refresh path). The existing `conversationApi.list(includeArchived)` and `useConversationListQuery` are **not modified** and the chat sidebar is **not affected**. The bounded limit is a single deterministic product constant `HOME_RECENT_CONVERSATIONS_LIMIT = 5` (defined once in `home.api.ts` and reused by the hook and tests) — not a per-call "e.g. 5". `useRecentConversationsQuery(limit)` (`features/home/home-hooks.ts`) uses the dedicated key `['chat','conversations','recent',{limit}]` — a **descendant** of `['chat','conversations']` — so it neither collides with nor perturbs the sidebar's cache. **Invalidation (verified by inspection of `chat-hooks.ts`):** every existing conversation mutation — `useCreateConversationMutation`, `useSendMessageMutation`, `useSetArchivedMutation`, `useDeleteConversationMutation` — calls `invalidateQueries({ queryKey: ['chat','conversations'] })`. TanStack Query v5 invalidation uses prefix matching by default, so each of these already invalidates the recent query (keyed under that prefix). **No additional invalidation is required**; the reused `useCreateConversationMutation` refreshes the recent list after the Home Dashboard starts a new conversation, and archive/delete/send from the chat pages refresh it too. The only requirement is that the recent key remain a descendant of `['chat','conversations']`. **Retry policy:** `useRecentConversationsQuery` reuses the existing sidebar strategy — `retry: false`, **no `refetchInterval`** (no polling loop), manual refetch only via the chat region's retry control on error (FR-008, SC-004). Read-only rendering on the Home Dashboard; archive/delete stay in the chat sidebar (FR-030).
7. **Page stays thin; route-level effects stay in the page; exactly one generation flow.** The auto-start-on-`PLAN_NOT_FOUND` effect and the `ONBOARDING_STEP_BLOCKED`/`SAFETY_HOLD` redirect effects remain in `dashboard/page.tsx` (route concerns). The page delegates rendering to `HomeDashboardView`. **Exactly one plan-generation flow exists**: the existing Spec 002 auto-start effect (preserved unchanged). The `firstRun`/`startable` state's "generate your (first) coaching plan" affordance is the **same** `useStartGenerationMutation` the auto-start uses, retained as the manual fallback for the brief pre-auto-start frame (and the retry path); it is **not** a separate first-run-only generation trigger. The "generate your first coaching plan" wording (FR-002a) describes the auto-start generation in the first-run context, shown during the `starting`→`pending`/`generating` transition, not a distinct clickable action that competes with auto-start. No backend API is changed.
8. **Adopt shadcn/ui incrementally — install once, use only for new Home files, no migration.** The repo already depends on the shadcn/ui runtime set (`@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`) but has **not** initialized shadcn (no `components.json`, no `components/ui/`). Spec 006 installs and configures shadcn/ui **once** (adding `components.json` + the `cn` util + the few primitives the new Home Dashboard files need, e.g. `Button`, `Card`), configured to **match the existing design tokens** (slate palette, `rounded-3xl`/`rounded-full`, `text-start`, `focus-visible:ring`) so the new surfaces are visually cohesive with the current raw-Tailwind dashboard/chat/coaching views. shadcn primitives are used **only** in the new `features/home/*` files and the two co-located layouts. **Existing `features/chat/*` and `features/coaching/*` components are NOT rewritten or migrated** (no churn to Spec 004/005), and no unrelated page is migrated. This is gradual adoption, not a redesign (Constitution XII).
9. **Partial query failures degrade per region; one section's failure never blocks another.** The Home Dashboard consumes `useCoachingPlanQuery` and `useRecentConversationsQuery` independently. Each region owns its own loading / success / empty / error surface:
   - **Plan region** — coaching query drives it: loading (coaching query loading and no data → existing loading state), success (READY → `CoachingPlanView`; non-ready → state card), error (coaching error → existing error/guidance states). Independent of the conversations query.
   - **Chat region** — recent-conversations query drives it: loading (query loading and no cached data → chat-region skeleton, plan region still renders), success-empty (zero items → first-conversation prompt if a plan exists (FR-002b), or the `firstRun` composite if coaching is also `startable`), success-non-empty (continue-chat + recent list), error (query errored → chat-region error card with a manual retry that calls `refetch()`, plan region still renders).
   - **Composite `firstRun`** requires coaching `startable` **and** conversations query **success** **and** zero items. If conversations is **loading**, the composite stays `startable` (chat region shows loading) until it resolves — `firstRun` is never asserted on incomplete data. If conversations **errors**, the composite is `startable` with the chat region showing its error/retry (the user can still act on the plan); `firstRun` is not asserted.
   - One region's error must not disable or hide the other region, and must not trigger a global error state (FR-002b: a plan present with a failed conversations query still shows the plan). No cross-region retry coupling.
10. **Separate orchestration rules from state derivation.** The pure Home Dashboard logic is split into three focused, framework-free modules instead of one: `home-dashboard-state.ts` (the `HomeDashboardState` type + `resolveHomeDashboardView` — state derivation only), `home-primary-action.ts` (the `PrimaryAction` type + `resolvePrimaryAction` — the FR-035 primary-action rule), and `home-chat.ts` (`selectContinueChatTarget` — the FR-017 chat-target rule). The state model is **not redesigned** — types and functions are unchanged, only relocated. Rationale: each module maps to one spec concern (state derivation / FR-035 / FR-017), is independently locatable and testable, and the FR-035 mapping (the most growth-prone piece) evolves without touching state derivation. Dependencies are one-directional (`home-primary-action.ts` imports the `HomeDashboardState` type; `home-chat.ts` imports only the DTO type) — no cycles. Each file is far under the 300-line limit. The split is a maintainability/locate-ability improvement, not file-size pressure (the original module was ~120 lines).
11. **Shared `AppShell` for the Home / Plan / Chat boundary.** The two co-located layouts (`dashboard/layout.tsx`, `chat/layout.tsx`) compose a single shared `AppShell` component (`features/home/app-shell.tsx`) instead of each inlining `<TopNav/>`. `AppShell` owns the chrome that is **identical** across the dashboard and chat surfaces — it renders `<TopNav/>` above `{children}` and serves as the single extension point for future shared chrome. It deliberately does **NOT** impose a page container, `min-h-screen`, or a `<main>` landmark: the dashboard page and the chat page each own their own `<main>`/container/height, and the chat page's root is `<main className="min-h-screen …">` (Spec-005-preserved) — wrapping it in a shared min-height/container would change chat's layout and violate the no-Spec-005-change constraint. So `AppShell` is `<TopNav/> + {children}` (a fragment), and each page keeps its own page container. This removes the duplicated layout markup (the `<TopNav/>` import/render was the only shared bit) and gives a single place to add future shared chrome (e.g. a skip-link target, a banner slot), with two genuine consumers justifying the shared component (Constitution VIII — not a speculative abstraction). No routing layer is added and URLs are unchanged — `AppShell` is a plain component rendered inside the existing layouts.

## Data Flow

```text
dashboard/page.tsx
  ├── useCoachingPlanQuery() ──────────► GET /api/v1/coaching/plan   (existing)
  │     ├── effect: PLAN_NOT_FOUND + !startPending ──► useStartGenerationMutation() ──► POST /coaching/plan  (existing, preserved)
  │     ├── effect: ONBOARDING_STEP_BLOCKED ──► router.replace(routeForStep(nextStep))  (existing)
  │     └── effect: SAFETY_HOLD ──► router.replace('/safety/hold')   (existing)
  ├── useStartGenerationMutation() / useAcceptPlanMutation() / useUpdateActionStatusMutation()  (existing, reused)
  ├── useRecentConversationsQuery(HOME_RECENT_CONVERSATIONS_LIMIT=5) ──► getRecentConversations(limit) ──► GET /api/v1/conversations?includeArchived=false&limit=5  (NEW helper, EXISTING endpoint)
  └── useCreateConversationMutation() ─► POST /api/v1/conversations  (existing, reused)
        └─ onSuccess ──► router.push('/chat/{id}')

HomeDashboardView (presentational orchestrator — composes, does not re-implement)
  ├── resolveHomeDashboardView({ coachingView, conversationsQuery: { status, items } }) ──► HomeDashboardState  (pure [home-dashboard-state]; firstRun needs status==='success' && items.length===0)
  ├── resolvePrimaryAction(state) ──► PrimaryAction | none  (pure [home-primary-action], FR-035; button only for non-READY actionable states; READY → guidance label)
  ├── selectContinueChatTarget(activeConversations) ──► ConversationSummaryDto | undefined  (pure [home-chat])
  ├── <HomePlanRegion/>   ── <section id="coaching-plan"> ALWAYS rendered (sync); reuses <CoachingPlanView/> for READY (its own action is primary — NO Home CTA); state cards + Home CTA for non-ready actionable states
  ├── <HomeChatRegion/>   ── continue-chat card, start-new, recent list (read-only); OWN loading/empty/error surface (partial-failure isolation, AD-9)
  └── effect: hash #coaching-plan ──► document.getElementById('coaching-plan')?.scrollIntoView()  (reliable scroll, not browser-default only)

(protected)/dashboard/layout.tsx  ┐
                                 ├─ co-located layouts, each composes <AppShell>{children}</AppShell>
(protected)/chat/layout.tsx       ┘   (chat/layout covers /chat and /chat/[conversationId])
  └── <AppShell/>  ── mounts <TopNav/> (shared chrome; imposes NO page container/min-height — each page owns its <main>)
        └── <TopNav/>  ── links: Home (/dashboard), Plan (/dashboard#coaching-plan), Chat (/chat); active via usePathname + hash (Plan active on #coaching-plan)
```

All data flows through the existing `api-client.ts` `apiFetch` (the same auth/refresh path used by every feature). The coaching path goes through the existing `ApiService` → `coachingApi`; the recent-conversations path goes through the new `home.api.ts` helper, which calls the **same existing endpoint** via `apiFetch` — it does not introduce a new transport or a parallel API client. No component calls `fetch` directly (Constitution: API-only-through-service-layer). No response is cached to override the backend (FR-025); TanStack Query's in-memory cache is the only cache. The recent-conversations query uses a dedicated key so it never perturbs the Spec 005 sidebar's cache.

## Component Structure

- **`home-dashboard-state.ts`** (pure, no React) — exports `HomeDashboardState` (extends the existing `CoachingDashboardView` set with `firstRun`) and `resolveHomeDashboardView({ coachingView, conversationsQuery })` (input includes the conversations query **status** — loading/success/error — not just a count, so `firstRun` is never asserted on incomplete data). **State derivation only.** ~50 lines.
- **`home-primary-action.ts`** (pure, no React) — exports `PrimaryAction` (`'generate-plan' | 'generate-first-plan' | 'accept-plan' | 'continue-plan' | 'review-completed-plan' | 'retry' | 'none'`) and `resolvePrimaryAction(state)` (the FR-035 mapping). Imports the `HomeDashboardState` type from `home-dashboard-state.ts` (one-directional, no cycle). ~40 lines.
- **`home-chat.ts`** (pure, no React) — exports `selectContinueChatTarget(activeConversations)` (the FR-017 deterministic target = `items[0]`). Imports only `ConversationSummaryDto`. ~15 lines.
- **`home.api.ts`** (thin helper, no class) — exports the deterministic constant `HOME_RECENT_CONVERSATIONS_LIMIT = 5` and `getRecentConversations(limit: number): Promise<ConversationListResponse>` calling `GET /api/v1/conversations?includeArchived=false&limit=${limit}` via the shared `apiFetch`. This is the **only** data access added; it reuses the existing endpoint and transport, and leaves `features/chat/chat.api.ts` untouched. ~25 lines.
- **`home-hooks.ts`** — exports `useRecentConversationsQuery(limit)` (TanStack Query, dedicated key `['chat','conversations','recent',{limit}]` — a descendant of `['chat','conversations']` so the existing create/send/archive/delete invalidations refresh it automatically; `retry: false`, **no `refetchInterval`** (no polling); manual refetch on error via the chat region's retry control). Dedicated key so the Spec 005 sidebar cache is unaffected. ~40 lines.
- **`home-dashboard-view.tsx`** — wires the coaching query, `useRecentConversationsQuery`, and the reused mutations; computes composite state (from coaching view **and** conversations query status) + primary action + continue target (importing the three pure modules above); renders header + `HomePlanRegion` + `HomeChatRegion` in the strict FR-032 rendering order. Mounts a `useEffect` that scrolls `#coaching-plan` into view on hash change (reliable Plan-anchor scroll). Each region renders its own loading/empty/error surface so a failure in one query never blocks the other (AD-9). ~180 lines.
- **`home-plan-region.tsx`** — always renders the synchronous wrapper `<section id="coaching-plan">` (anchor target present from first paint for every state). For READY states renders `<CoachingPlanView/>` (reused, props threaded from the page, **not modified**) and renders **no** Home-level CTA button — `CoachingPlanView`'s own accept / continue-chat / action controls are the primary action (AD-2/AD-4); the `PrimaryAction` value drives only a guidance label. For non-ready actionable states renders a compact `StateCard` (local helper, extracted from the current dashboard page) plus the single Home-level CTA button (`generate-first-plan`/`generate-plan`/`retry`). Enforces FR-036a single dominant focus. ~140 lines.
- **`home-chat-region.tsx`** — renders Priority-3 continue-chat / start-new-conversation and Priority-4 recent conversations, with its **own** loading / empty / error surface (partial-failure isolation, AD-9): a query error shows a chat-region error card with a manual retry (`refetch()`), never hiding the plan region. Continue-chat card targets `selectContinueChatTarget()` and navigates to `/chat/{id}`. Start-new calls `useCreateConversationMutation` (reused) and navigates to the new conversation URL. Recent list is read-only and bounded (`HOME_RECENT_CONVERSATIONS_LIMIT`), sourced from `useRecentConversationsQuery`. Handles FR-002b (plan exists, no conversations → "start your first conversation" prompt, not an error). ~160 lines.
- **`app-shell.tsx`** — the shared chrome for the Home / Plan / Chat boundary. Renders `<TopNav/>` above `{children}` and nothing else — deliberately **no** page container, `min-h-screen`, or `<main>` (each page owns its own; the chat page's `<main className="min-h-screen …">` root is Spec-005-preserved and must not be wrapped — AD-11). The single extension point for future shared chrome. ~20 lines.
- **`home-top-nav.tsx`** — accessible `<nav>` with three links (Home, Plan, Chat) using the i18n `Link` from `i18n/navigation`. Active state derived from `usePathname()` **plus** the URL hash (Home active on `/dashboard` without `#coaching-plan`; Plan active on `/dashboard` with `#coaching-plan`; Chat active on `/chat*`); the hash is read in a client effect. Rendered only by `AppShell`. ~60 lines.
- **`app/[locale]/(protected)/dashboard/layout.tsx`** and **`app/[locale]/(protected)/chat/layout.tsx`** — two thin co-located layouts that each render `<AppShell>{children}</AppShell>`. `chat/layout.tsx` wraps both `/chat` and `/chat/[conversationId]`. These are the only places `AppShell` (and therefore `TopNav`) is mounted, so the nav never appears on Assessment/Onboarding/Safety/Profile/Settings. Each ~10 lines. No existing `page.tsx` is edited to add the nav.

All components use `useTranslations` and accept labels via props or read namespaces directly, matching the existing coaching/chat convention. Styling: new `features/home/*` files and the two layouts use shadcn/ui primitives (installed/configured once for this feature — see AD-8) tuned to match the existing tokens (slate palette, `rounded-3xl`/`rounded-full`, `text-start`, `focus-visible:ring`, responsive `md:` breakpoints) so the Home Dashboard is visually cohesive with the current surfaces. Existing `features/chat/*` and `features/coaching/*` keep their raw-Tailwind styling unchanged (no migration).

## State Management

- **Server state**: TanStack Query, unchanged for existing features. The Home Dashboard adds one **new** query consumer, `useRecentConversationsQuery(limit)` (dedicated query key, `retry: false`, no `refetchInterval`), alongside the existing `useCoachingPlanQuery` (reused as-is). Polling remains governed by `shouldPollPlan` (poll only `PENDING`/`GENERATING`); no polling redesign (FR-011, SC-004). The Spec 005 `useConversationListQuery` is not consumed by the Home Dashboard and is not modified. The two queries are independent: each region renders its own loading/empty/error surface and one query failing never blocks the other (AD-9).
- **Client-only UI state**: `useState` only for transient, presentation-only flags (e.g. a pending create-conversation navigation). No React Context, no global state, no local persistence (FR-025, FR-031).
- **Composite Home Dashboard state**: derived per render via pure functions in `home-dashboard-state.ts`; never stored. The next API response always drives the rendered state (Constitution VI; returning-user story US10).

## Navigation Strategy

- **URL-based, preserving Spec 005 recovery (FR-020, FR-030).** Continue-chat and start-new-conversation navigate to `/chat/{conversationId}` so URL recovery and refresh-stay-in-conversation work unchanged.
- **Top-level nav (FR-022a).** The two co-located layouts — `dashboard/layout.tsx` and `chat/layout.tsx` (the latter covers `/chat` and `/chat/[conversationId]`) — each compose a single shared `<AppShell>{children}</AppShell>` (AD-11); `AppShell` mounts `<TopNav/>` and links Home → `/dashboard`, Plan → `/dashboard#coaching-plan`, Chat → `/chat`. No new routes, no file moves, no import-path changes. The active link reflects the current route **and hash**: Home active on `/dashboard` (no `#coaching-plan`), Plan active on `/dashboard#coaching-plan`, Chat active on `/chat*` (hash read in a client effect, since `usePathname` excludes it). The global `(protected)/layout.tsx` is unchanged, so Assessment/Onboarding/Safety/Profile/Settings do not get the nav. The existing chat header `backToPlan` link (FR-021) is left intact.
- **Return from chat.** Already provided by the chat header link to `/dashboard` (FR-021) and now also by `TopNav`.
- **Plan view.** Opens inline on the Home Dashboard (the plan region, always wrapped in `<section id="coaching-plan">`). The "Plan" nav item anchors to `#coaching-plan` within `/dashboard` (no new route — see Gap 1). Because the wrapper is rendered synchronously for every state, the anchor target exists from first paint; a `useEffect` in `HomeDashboardView` scrolls it into view on hash change so navigation does not rely on the browser's native hash scroll alone (AD-5).
- **Eligibility/safety redirects.** Remain route-level effects in `dashboard/page.tsx` (FR-013–FR-014).

## Files to Reuse (unchanged)

| File | Reuse |
|---|---|
| `features/coaching/coaching-dashboard-state.ts` | `resolveDashboardView`, `shouldPollPlan`, `selectBilingualText`, `CoachingDashboardView` type |
| `features/coaching/coaching-hooks.ts` | `useCoachingPlanQuery`, `useStartGenerationMutation`, `useAcceptPlanMutation`, `useUpdateActionStatusMutation`, `coachingPlanKey` |
| `features/coaching/coaching.api.ts` | `coachingApi` (start/get/accept/update-action) |
| `features/coaching/coaching-plan-view.tsx` | `<CoachingPlanView/>` rendered inside the plan region for READY states |
| `features/chat/chat.api.ts` | **Unchanged.** `conversationApi.list` / `create` are reused as-is by the chat sidebar. The Home Dashboard does **not** call `list`; it uses the new `home.api.ts` helper for the bounded recent list (preserves Spec 005). |
| `features/chat/chat-hooks.ts` | **Unchanged.** `useCreateConversationMutation` is reused by the Home Dashboard's start-new-conversation action. `useConversationListQuery` is not consumed by the Home Dashboard (it uses `useRecentConversationsQuery`). |
| `features/chat/conversation-list.tsx` | `labelFor` pattern + `ConversationSummaryDto` shape (read-only recent list is a small new component to avoid importing the mutating sidebar) |
| `components/guards/require-auth.tsx` | UX auth guard (unchanged) |
| `components/guards/require-onboarding.tsx` | UX onboarding guard (unchanged) |
| `lib/api-client.ts` | `ApiError`, `apiFetch`, transparent refresh |
| `services/api.ts` | `ApiService` base |
| `i18n/navigation.ts` | `useRouter`, `Link` (locale-aware) |
| `features/onboarding/onboarding-routes.ts` | `routeForStep` for the eligibility redirect |
| `@priora/shared-types` | `CoachingPlanResponse`, `GenerationStatusResponse`, `ConversationSummaryDto`, `ConversationListResponse`, `Bilingual` |
| Styling convention | The repo depends on the shadcn/ui runtime set (`@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`) but has **not** initialized shadcn (no `components.json`, no `components/ui/`). Spec 006 initializes shadcn/ui **once** and uses primitives (e.g. `Button`, `Card`) **only** in the new `features/home/*` files and the two co-located layouts, configured to match the existing tokens (slate palette, `rounded-3xl`/`rounded-full`, `text-start`, `focus-visible:ring`). Existing `features/chat/*` and `features/coaching/*` keep their raw-Tailwind styling — **not migrated** (AD-8). Frontend_Architecture §13 lists Button/Card/Badge/Progress as intended design-system components; this feature adopts them incrementally rather than migrating existing surfaces. |

## Files to Modify

| File | Change |
|---|---|
| `app/[locale]/(protected)/dashboard/page.tsx` (in place — **not relocated**) | Replace the inline coaching-only body with `<HomeDashboardView …/>`. Keep `RequireOnboarding`, the auto-start-on-`PLAN_NOT_FOUND` effect (the **single** plan-generation flow, Spec 002 preserved — AD-7), and the `ONBOARDING_STEP_BLOCKED`/`SAFETY_HOLD` redirect effects (route-level). Thread query/mutation handles + labels into the view. Existing relative imports unchanged. Stays ≤ 300 lines. |
| `i18n/messages/en.json` | Add `home.*` and `nav.*` keys (see data-model / contracts). |
| `i18n/messages/ar.json` | Add the same keys in Arabic. |

**Explicitly NOT modified**: `app/[locale]/(protected)/layout.tsx` (the global protected layout stays the bare `RequireAuth` wrapper — no `TopNav`/`AppShell`), the chat route pages (`chat/page.tsx` and `chat/[conversationId]/page.tsx` — not moved, not edited), `features/chat/chat.api.ts`, `features/chat/chat-hooks.ts`, and all other `features/chat/*` and `features/coaching/*` files. The chat pages inherit `TopNav` purely through the new sibling `chat/layout.tsx` composing `<AppShell/>`.

## Files to Add

| File | Purpose | Est. lines |
|---|---|---|
| `features/home/home-dashboard-state.ts` | Pure composite-state derivation only: `HomeDashboardState` type + `resolveHomeDashboardView` (AD-10) | ~50 |
| `features/home/home-primary-action.ts` | Pure primary-action rule: `PrimaryAction` type + `resolvePrimaryAction(state)` (FR-035; AD-10) | ~40 |
| `features/home/home-chat.ts` | Pure continue-chat target rule: `selectContinueChatTarget(activeConversations)` (FR-017; AD-10) | ~15 |
| `features/home/home.api.ts` | `getRecentConversations(limit)` helper — reuses existing endpoint via `apiFetch`; leaves `chat.api.ts` untouched | ~25 |
| `features/home/home-hooks.ts` | `useRecentConversationsQuery(limit)` with a dedicated query key | ~40 |
| `features/home/home-dashboard-view.tsx` | Presentational orchestrator (header + plan region + chat region, strict render order) | ~180 |
| `features/home/home-plan-region.tsx` | Coaching status region + primary CTA; reuses `<CoachingPlanView/>`; local `StateCard` helper | ~140 |
| `features/home/home-chat-region.tsx` | Continue-chat card, start-new-conversation, read-only recent list, FR-002b prompt | ~160 |
| `features/home/app-shell.tsx` | Shared chrome for the Home/Plan/Chat boundary — renders `<TopNav/>` above `{children}`, imposes no page container/min-height/`<main>` (AD-11) | ~20 |
| `features/home/home-top-nav.tsx` | The single shared top-level nav component (Home / Plan / Chat); rendered only by `AppShell` | ~60 |
| `app/[locale]/(protected)/dashboard/layout.tsx` | Co-located layout composing `<AppShell>{children}</AppShell>` for `/dashboard` | ~10 |
| `app/[locale]/(protected)/chat/layout.tsx` | Co-located layout composing `<AppShell>{children}</AppShell>` for `/chat` and `/chat/[conversationId]` | ~10 |
| `components.json` + `src/lib/utils.ts` | shadcn/ui one-time initialization (config + `cn` helper) — AD-8 | ~10 |
| `src/components/ui/{button,card}.tsx` | shadcn/ui primitives used by new Home files only (generated, token-matched) | ~60 |
| `tests/e2e/home-dashboard-state.spec.ts` | Playwright coverage of pure state/CTA/target logic (mirrors the existing `coaching-dashboard-state.spec.ts` e2e style) | ~140 |
| `tests/e2e/home-dashboard.spec.ts` | Playwright journeys: first-run, ready-active, completed, continue-chat, start-new, top-nav, partial-failure, RTL | ~160 |

All new handwritten files are planned to stay well under the 300-line limit.

## Responsive Strategy

- Mobile-first single-column layout using the existing Tailwind `container`, `px-4`, and `md:` breakpoints already used by the dashboard and chat views.
- Plan region and chat region stack vertically on mobile; on `md:` and above, the chat region can sit beside/after the plan region without letting Priority-4 recent conversations dominate Priority-1/2 (FR-033).
- No horizontal overflow at mobile width (SC-009): `min-w-0` on flex children, `overflow-x-hidden` where the chat view already uses it.
- Recent conversations may be omitted on very small viewports per FR-023's SHOULD (space does not permit) — implemented as a responsive `hidden sm:block` on the recent list, while continue-chat and start-new remain visible.

## Arabic / RTL Considerations

- All new copy is authored in both `en.json` and `ar.json` simultaneously (Constitution X).
- RTL is provided by the existing next-intl `<html dir>` setup; the Home Dashboard uses logical properties / `text-start` / `flex` ordering that already mirror correctly (the existing `CoachingPlanView` and `ConversationList` use `text-start` and `ps`/`pe`-friendly patterns).
- `TopNav` uses `flex` with logical spacing so it mirrors automatically.
- Numbers, dates (recent conversation timestamps), and mixed content rely on the existing `toLocaleDateString` usage; RTL correctness is verified by an RTL Playwright test (SC-009), not only by setting `dir`.
- Accessibility in both LTR and RTL: semantic landmarks (`<nav>`, `<main>`, `aria-labelledby`), visible focus rings (matching existing `focus-visible:ring`), and `aria-current="page"` on the active nav link.

## Testing Strategy

The frontend has exactly one configured test runner — **Playwright** (`@playwright/test`, `tests/e2e/*`). There is no Vitest/Jest/RTL, and **none is introduced** (no-new-testing-framework constraint). Pure state logic is kept framework-free in `home-dashboard-state.ts` so it is exercised through Playwright routes, mirroring the existing `tests/e2e/coaching-dashboard-state.spec.ts` (an e2e file, not a unit file).

**Playwright — `home-dashboard-state.spec.ts`** (pure logic via routes/fixtures):
- `resolveHomeDashboardView`: `firstRun` only when `startable` + conversations query **success** + zero items; **not** `firstRun` while conversations is loading or errored (AD-9); plan-exists-no-conversations delegates to the coaching view; every existing `CoachingDashboardView` passes through unchanged.
- `resolvePrimaryAction`: the full FR-035 mapping, including `none` for waiting/guidance states and `review-completed-plan` (not `continue-plan`) for `readyCompleted`.
- `selectContinueChatTarget`: returns `items[0]` for a non-empty active list; `undefined` when empty; deterministic across identical input (no client sort).

**Playwright — `home-dashboard.spec.ts`** (rendering + journeys):
- Render per state: `firstRun` (first-run wording, no error messaging), `startable`, `pending`/`generating` (no CTA), `readyProposed` (accept action is `CoachingPlanView`'s own button — **no duplicate Home CTA**), `readyActive` (continue), `readyCompleted` (review wording, no new-plan action), `failedRetryable` (retry, no auto-retry), `unavailable` (no retry), `noAssessment`, `safetyHold`, `ineligible`, `error`.
- FR-032/FR-033/FR-036a: rendering order; the single dominant action; recent conversations do not displace plan/CTA.
- FR-002b: plan present + no conversations → "start your first conversation" prompt, no error.
- Partial-failure (AD-9): coaching succeeds + conversations fails → plan region renders, chat region shows error + retry; conversations succeeds + coaching fails → chat region renders, plan region shows its error. One region's failure never hides the other.
- Exactly one generation flow (AD-7): on `PLAN_NOT_FOUND` the auto-start fires; no competing first-run generation trigger is rendered.
- Plan anchor: navigating to `/dashboard#coaching-plan` scrolls to `#coaching-plan` (wrapper always present); `TopNav` Plan is active on `#coaching-plan`.
- Continue-chat navigates to `/chat/{id}`; refresh stays in conversation (SC-005). Start-new lands on the new URL (SC-006).
- Top-nav Home ↔ Chat ↔ Plan (SC-007); `TopNav` absent on `/assessment` (layout-scope).
- No polling loop after terminal states (reusing `useCoachingPlanQuery` unchanged → `refetchInterval` false on terminal/error).
- Arabic locale: full translation + RTL mirroring, no horizontal overflow mobile + desktop (SC-009).

**Regression**: existing `tests/e2e/coaching-plan.spec.ts`, `coaching-dashboard-state.spec.ts`, and chat e2e continue to pass unchanged (SC-011). The only Spec 005-adjacent change is layout chrome (`TopNav`), which does not alter chat routes/recovery/messages.

## Validation Strategy

- **Lint**: `npm run lint` passes (`eslint . --fix`).
- **Type check**: `npx tsc --noEmit` passes for `03-FRONTEND` and `shared`.
- **Build**: `npm run build` (`next build`) succeeds.
- **Tests**: `npx playwright test` — all Playwright suites pass, including unchanged Spec 004/005 tests.
- **300-line gate**: every new handwritten file ≤ 300 lines (verified by `find` + line count in CI/locally).
- **Scope gate (SC-010, SC-012)**: grep the `features/home` tree to confirm no imports from RAG/LLM/Qdrant/Python services, no streaming, no analytics/notifications/summaries APIs, no `localStorage`/`sessionStorage` persistence.
- **Reuse / no-regression gate (AD-0, FR-030)**: confirm `features/chat/*` and `features/coaching/*` are unchanged by the feature (e.g. `git diff --stat` shows no edits under those trees), and that `features/home` imports — not re-implements — `CoachingPlanView`, the coaching hooks, and `useCreateConversationMutation`.
- **Layout-scope gate (FR-022a, AD-11)**: confirm `AppShell` is composed only by `dashboard/layout.tsx` and `chat/layout.tsx`, that `<TopNav/>` is rendered only inside `features/home/app-shell.tsx`, that no chat/dashboard page file was moved or import-rewritten, and that Assessment/Onboarding/Safety pages do not render it (an e2e visit asserts its absence on `/assessment`).
- **Constitution gate**: safety/eligibility deferred to backend (no new rules); privacy (no persistence); i18n equality (en+ar keys asserted in a test); simplicity (no speculative abstractions).
- **Manual smoke**: log in as a user in each coaching state (no plan, generating, ready-proposed, active, completed, failed-retryable, safety-held) and confirm the Home Dashboard matches the backend response and FR-035 CTA.

## Repository Gaps Discovered Before Implementation

1. **No dedicated coaching-plan route.** FR-022a's "plan-view route" does not exist; the plan is rendered inside `/dashboard`, and `/plans`/`/plans/:id` are documented as future (Frontend_Architecture §17). **Resolution:** "Plan" nav links to `/dashboard#coaching-plan` (in-page anchor). The plan region is always wrapped in a synchronous `<section id="coaching-plan">` (present from first paint for every state), and `HomeDashboardView` scrolls to it on hash change, so the anchor is reliable without a new route (AD-5). If a separate plan route is desired later, it is out of this spec's scope.
2. **Recent-conversations `limit` without disturbing Spec 005.** The existing `conversationApi.list(includeArchived)` does not pass `limit` and is consumed by the Spec 005 sidebar. **Resolution:** do not modify `list()`; add a dedicated `features/home/home.api.ts` helper `getRecentConversations(limit)` that calls the same existing endpoint with `&limit=`. No `features/chat/*` file is edited; no existing consumer is affected. (Supersedes the earlier "extend `list`" idea — rejected to preserve backward compatibility and minimize regression risk.)
3. **First-run vs. auto-generation conflict (resolved: exactly one generation flow).** The plan must not present both an explicit "generate your first coaching plan" CTA **and** the preserved Spec 002 auto-start-on-`PLAN_NOT_FOUND` behavior as two competing triggers. **Resolution:** there is exactly **one** plan-generation flow — the existing auto-start effect (Spec 002, preserved unchanged, AD-7). The `firstRun`/`startable` "generate your (first) coaching plan" affordance is the **same** `useStartGenerationMutation` auto-start uses, kept only as the manual fallback for the brief pre-auto-start frame and the `failed-retryable` retry path; it is **not** a separate first-run-only trigger. The FR-002a "generate your first coaching plan" wording describes the auto-start generation in the first-run context (shown during `starting`→`pending`/`generating`), not a distinct action. No backend API is changed; no Spec 002 modification.
4. **The global `(protected)` layout is the wrong boundary for Home/Plan/Chat nav.** `(protected)` also contains `assessment`, `onboarding`, and `safety`, which must not receive Home/Plan/Chat navigation. **Resolution:** co-located per-route layouts — `dashboard/layout.tsx` and `chat/layout.tsx` — each mounting the single shared `TopNav`. This scopes the nav to exactly `/dashboard`, `/chat`, and `/chat/[conversationId]` with **no file moves, no import-path changes, and no edits to any existing `page.tsx`**. A nested `(home)` route group was considered and rejected as an unnecessary mechanical move: its only benefit would be one layout file instead of two, at the cost of relocating three route folders and rewriting their relative imports — strictly more disruption for identical behavior. (Supersedes both the earlier "TopNav in global protected layout" idea — rejected because it pollutes unrelated protected pages — and the "relocate into `(home)`" idea — rejected because co-located layouts achieve the same scoping without relocation.)

5. **shadcn/ui not yet initialized.** The repo depends on the shadcn runtime set but has no `components.json`/`components/ui/`. **Resolution:** initialize shadcn/ui once for Spec 006 and use primitives only in new `features/home/*` files + the two layouts, token-matched to existing surfaces; do not migrate `features/chat/*` or `features/coaching/*` (AD-8). This is incremental adoption, not a UI migration.
6. **No unit/component test runner is configured.** The frontend has only Playwright (`tests/e2e/*`); there is no Vitest/Jest/RTL. **Resolution:** do not introduce a new test framework. Pure state logic is exercised through Playwright (mirroring `coaching-dashboard-state.spec.ts`); the testing strategy is Playwright-only.

No backend, DTO, database, or lifecycle gaps were found — all consumed capabilities already exist.