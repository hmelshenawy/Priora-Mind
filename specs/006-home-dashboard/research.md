# Research: Post-Onboarding Home Dashboard

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-08-04

The finalized spec contains no `[NEEDS CLARIFICATION]` markers — every ambiguity was resolved during specification and recorded in the spec's Assumptions and Reference Alignment sections. This document records the implementation-side research decisions that the plan depends on, with rationale and alternatives considered.

## R1 — Composite `first-run` state derivation

**Decision**: `first-run` is a pure composite of the existing `CoachingDashboardView === 'startable'` (no plan) **and** zero active conversations. It is computed per render in `home-dashboard-state.ts`, never stored, and is **not** a coaching lifecycle state (FR-004).

**Rationale**: The backend exposes no "first-run" flag, and the spec forbids inventing one (FR-025, FR-031). Both inputs already exist: the coaching query returns `PLAN_NOT_FOUND` (mapped to `startable`) and the conversation list returns `items: []`. A pure function over these two responses yields the composite state with zero new backend fields.

**Alternatives considered**:
- A dedicated backend "first-run" endpoint — rejected (invents an API; violates constraints).
- Local-storage "has visited" flag — rejected (local persistence; violates FR-025/FR-031 and breaks the returning-user story US10, which requires reconstruction from live APIs).
- Treating no-plan as first-run regardless of conversations — rejected by FR-002a/US9 acceptance scenario 5 (no plan + conversations → no-plan state, not first-run).

## R2 — Deterministic continue-chat target selection

**Decision**: The continue-chat target is `conversationList.items[0]` where the list is requested with `includeArchived=false`. The backend sorts by `updatedAt desc, id desc` (confirmed in the Conversation API contract), so `items[0]` is the active conversation with the greatest last-update timestamp, ties broken by the backend's fixed `id desc` secondary ordering.

**Rationale**: FR-017 forbids ambiguous "latest conversation" wording and requires a single repeatable target with backend-owned tie-breaking. Client-side sorting would duplicate the backend's ordering and could diverge; consuming the already-sorted list is the single-source-of-truth approach (Constitution VIII: single source of truth).

**Alternatives considered**:
- A dedicated "most-recent conversation" endpoint — rejected (invents an API; the spec's Assumptions note no such endpoint exists and the list endpoint is sufficient).
- Client-side sort by `lastMessageAt`/`updatedAt` — rejected (duplicates backend ordering; risks tie-break divergence). The `updatedAt` field is available on `ConversationSummaryDto`, but re-sorting client-side adds no value over the server's `updatedAt desc, id desc` order and risks inconsistency.

## R3 — Primary CTA as a pure frontend rule

**Decision**: `resolvePrimaryAction(state)` is a pure function in `home-dashboard-state.ts` implementing the FR-035 state→action mapping. It returns a `PrimaryAction` literal or `'none'`. No backend field is introduced.

**Rationale**: FR-035 explicitly requires the primary action to be "a deterministic frontend presentation rule derived entirely from the existing coaching-plan state." Co-locating it with the composite-state resolver keeps all presentation-only logic in one framework-free, unit-testable module (Constitution VIII, IX).

**Alternatives considered**:
- Embedding the mapping inside the view component — rejected (mixes presentation logic with rendering; harder to unit-test; risks duplication across plan/chat regions).
- A backend "recommended action" field — rejected (invents a field; violates FR-035 and the no-backend-changes constraint).

## R4 — Top-level navigation placement

**Decision**: The single shared `home-top-nav.tsx` component is rendered by one shared `features/home/app-shell.tsx` (`<AppShell>` = `<TopNav/>` above `{children}`, nothing else — AD-11), which is **composed by two co-located per-route layouts**: `app/[locale]/(protected)/dashboard/layout.tsx` and `app/[locale]/(protected)/chat/layout.tsx`, each rendering `<AppShell>{children}</AppShell>`. `TopNav` links Home → `/dashboard`, Plan → `/dashboard#coaching-plan`, Chat → `/chat`, using the locale-aware `Link` from `i18n/navigation`. No new routes. The global `(protected)/layout.tsx` is left unchanged, and no chat or dashboard page is moved or import-rewritten. `AppShell` deliberately imposes **no** page container, `min-h-screen`, or `<main>` — the dashboard page and the chat page each own their own `<main>`/container/height, and the chat page's root is `<main className="min-h-screen …">` (Spec-005-preserved); wrapping it in a shared min-height/container would change chat's layout and violate the no-Spec-005-change constraint.

**Rationale**: FR-022a requires a consistent top-level nav affordance across the three Home/Plan/Chat surfaces, but the `(protected)` group also contains `assessment`, `onboarding`, and `safety` (confirmed by inspection), so the global protected layout is the wrong boundary. App Router lets any route segment declare its own `layout.tsx`, which automatically wraps that segment and every nested segment. Therefore `dashboard/layout.tsx` scopes the nav to `/dashboard`, and `chat/layout.tsx` scopes it to `/chat` and `/chat/[conversationId]` (layouts apply to nested segments). Critically, **adding a sibling `layout.tsx` does not require touching the existing `page.tsx`** — the layout wraps the page, so the chat page files stay byte-for-byte unchanged (no move, no import-path change, no wrapping JSX). This achieves the exact scoping required with strictly less disruption than a route group.

**Alternatives considered**:
- `TopNav` in the global `(protected)/layout.tsx` — **rejected**: pollutes Assessment/Onboarding/Safety/Profile/Settings and future protected pages.
- A nested `(home)` route group containing `dashboard` and `chat` with one shared layout — **rejected as an unnecessary mechanical move**. Its only benefit is one layout file instead of two; its cost is relocating three route folders (`dashboard`, `chat`, `chat/[conversationId]`) one level deeper and rewriting the relative import paths in the chat page files (they use relative imports today, e.g. `../../../../components/…`). That is real disruption to Spec 005 file locations for zero behavioral advantage — co-located layouts achieve identical scoping without moving anything. Relocation would only be justified if a single shared layout segment were required, which it is not.
- A composition wrapper component (`<HomeShell>`) added **inside each `page.tsx`** — rejected: that variant edits the chat page *content* (wrapping JSX) and requires every future home-experience page to remember to wrap. The adopted `AppShell` is the **layout-composed** variant of this idea: a shared shell exists (so the chrome is not duplicated inline in two layouts), but it is composed by the co-located layouts, not inserted into any `page.tsx` — keeping page bodies byte-for-byte unchanged and the boundary declarative.
- Render `TopNav` only inside `HomeDashboardView` — rejected (chat would still lack the affordance, violating FR-022a's "three primary … experiences" requirement).
- A separate `/plan` route — rejected (no such route exists; Frontend_Architecture §17 lists `/plans` as future; "no new routes" constraint).

**Why co-located layouts + shared `AppShell` are preferable to relocation**: they preserve existing URLs, existing route recovery, existing imports, and existing Spec 005 behavior, and they do not increase architectural complexity (two ~10-line layout files that compose one shared `<AppShell>` — no duplicated chrome). `AppShell` removes the only duplication the two-layout approach would otherwise have (each inlining `<TopNav/>`) while staying a fragment that imposes no container/min-height, so the chat page's own `<main className="min-h-screen …">` is undisturbed. Relocation provides no architectural benefit that this approach does not already provide. Per the project's relocation-avoidance directive, the simpler approach is chosen.

**Active destination + Plan-anchor reliability (AD-5).** `TopNav` is a client component; active state is derived from `usePathname()` **plus** the URL hash — Home active on `/dashboard` without `#coaching-plan`, Plan active on `/dashboard#coaching-plan`, Chat active on `/chat*`. The hash is read in a client effect (`usePathname` excludes it) and kept in state. The Plan link is `/dashboard#coaching-plan`; the plan region is always wrapped in a synchronous `<section id="coaching-plan">` rendered for **every** Home Dashboard state (including no-plan, generating, failed, error), so the anchor target exists from first paint and is never async-dependent. Because Next.js client-side navigations do not always trigger the browser's native hash scroll, `HomeDashboardView` mounts a `useEffect` that scrolls `#coaching-plan` into view on hash change (and on initial mount when a hash is present). Reliability therefore does not rely on the browser default alone.

## R5 — Bounded recent-conversations query without touching Spec 005

**Decision**: Add a dedicated `features/home/home.api.ts` helper `getRecentConversations(limit)` that calls the existing `GET /api/v1/conversations?includeArchived=false&limit=${limit}` endpoint via the shared `apiFetch`, plus the deterministic constant `HOME_RECENT_CONVERSATIONS_LIMIT = 5` (one product decision, reused by the hook and tests — not a per-call "e.g. 5"). The existing `conversationApi.list(includeArchived)` and `useConversationListQuery` are **not modified** and the chat sidebar is **not affected**. A dedicated `useRecentConversationsQuery(limit)` hook in `features/home/home-hooks.ts` uses its own query key `['chat','conversations','recent',{limit}]` — a **descendant** of `['chat','conversations']` — so it neither collides with nor perturbs the sidebar's cache.

**Verified invalidation (inspected `chat-hooks.ts`)**: every existing conversation mutation calls `invalidateQueries({ queryKey: ['chat','conversations'] })` — `useCreateConversationMutation`, `useSendMessageMutation`, `useSetArchivedMutation`, and `useDeleteConversationMutation`. TanStack Query v5 invalidation uses prefix matching by default, so each already invalidates any key under that prefix, including `['chat','conversations','recent',{limit}]`. **No additional invalidation is required**: the reused `useCreateConversationMutation` refreshes the recent list after the Home Dashboard starts a new conversation, and archive/delete/send from the chat pages refresh it too. The only requirement is that the recent key remain a descendant of `['chat','conversations']`.

**Retry policy**: `useRecentConversationsQuery` reuses the existing sidebar strategy — `retry: false` (matching `useConversationListQuery`), **no `refetchInterval`** (no polling loop — FR-008, SC-004), manual refetch only via the chat region's retry control on error. No new retry budget is introduced.

**Rationale**: FR-023 (SHOULD) requires a bounded `limit` to avoid over-fetching; the spec Assumptions confirm the backend list endpoint supports `limit`. The user's refinement requires preserving the existing Chat API signature and behavior to minimize regression risk and protect Spec 005 consumers. A dedicated helper that reuses the same endpoint and transport satisfies the need without any change to `features/chat/*`. Constitution VIII (single source of truth — one endpoint) and XII (simplicity — a plain function, no new class/interface) are honored.

**Alternatives considered**:
- Extend `conversationApi.list(includeArchived, limit?)` — **rejected**: changes the signature/behavior of an API already consumed by Spec 005, raising regression risk. This was the earlier plan; superseded.
- Fetch the full list via `conversationApi.list(false)` and slice client-side — rejected: over-fetching (defeats FR-023) and couples the Home Dashboard to the sidebar's query/cache.
- A new `listRecent()` method on `ConversationApiService` — rejected: still edits `features/chat/chat.api.ts` (a Spec 005 file); the dedicated `home.api.ts` helper leaves every Spec 005 file untouched.

## R6 — Reuse of `CoachingPlanView` and the `StateCard` pattern

**Decision**: The plan region renders the existing `<CoachingPlanView/>` verbatim for `readyProposed`/`readyActive`/`readyCompleted`, threading the same props the current dashboard page threads. For non-ready states, it renders compact state cards using the `StateCard` pattern currently defined inline in `dashboard/page.tsx`, extracted as a local helper in `home-plan-region.tsx`.

**No competing Home CTA for READY states (AD-2/AD-4)**: `CoachingPlanView` already renders its own dominant action — the accept button for PROPOSED, the continue-chat button and action-step controls for ACTIVE/COMPLETED. The plan region therefore renders **no** Home-level primary CTA button for READY states; `CoachingPlanView`'s own action IS the single primary action (FR-036a). The `PrimaryAction` value for READY states drives only a short guidance label ("Next: accept your plan" / "Next: continue your plan" / "Next: review your completed plan"), never a duplicate button. A Home-level CTA button is rendered **only** for non-READY actionable states (`firstRun`/`startable` → generate; `failedRetryable` → retry), where `CoachingPlanView` is not shown. `CoachingPlanView` is **not modified** — a `presentation` mode prop was considered and rejected as unnecessary, since not rendering a duplicate CTA is sufficient and avoids touching a Spec 004 component.

**Rationale**: Maximizes reuse (spec objective). Extracting `StateCard` into the plan region (local helper, not a global shared component) avoids duplication between the dashboard page and the new region without creating a premature shared abstraction (Constitution VIII: no speculative abstractions; one consumer does not require a shared component).

**Alternatives considered**:
- A global `components/StateCard.tsx` — rejected (single consumer; would be a speculative abstraction until a second consumer appears).
- Re-implementing the plan view — rejected (duplicates a large, tested component).

## R7 — Exactly one plan-generation flow (auto-start preserved)

**Decision**: There is exactly **one** plan-generation flow — the existing `useEffect` in `dashboard/page.tsx` that calls `start.mutate()` on `PLAN_NOT_FOUND` (Spec 002), preserved unchanged in the reworked Home Dashboard page. The `firstRun`/`startable` "generate your (first) coaching plan" affordance is the **same** `useStartGenerationMutation` the auto-start uses; it is retained only as the manual fallback for the brief pre-auto-start frame and the `failed-retryable` retry path. It is **not** a separate first-run-only generation trigger. The FR-002a "generate your first coaching plan" wording describes the auto-start generation in the first-run context (shown during the `starting`→`pending`/`generating` transition), not a distinct clickable action that competes with auto-start.

**Rationale**: The plan must not present both an explicit "generate your first coaching plan" CTA **and** the preserved auto-start as two competing triggers. The spec Assumptions explicitly preserve Spec 002's auto-start behavior (Spec 002 modification is out of scope), so auto-start is the chosen single flow. The explicit start affordance remains as the documented fallback for the failed-retryable path and the pre-auto-start frame, satisfying FR-006/FR-007 without introducing a second trigger. No backend API is changed.

**Alternatives considered**:
- Removing auto-start to make an explicit first-run "generate" CTA durable — rejected (modifies Spec 002; out of scope) and would invent a second generation trigger.
- Rendering a separate first-run-only "generate your first plan" button alongside auto-start — rejected (two competing generation triggers; violates "exactly one generation flow").

## R8 — Localization key strategy

**Decision**: Add new keys under a new `home` namespace and extend the existing `nav` namespace (currently only `register`/`login`/`dashboard`) with `home`, `plan`, `chat`. Reuse existing `coaching.*` state copy (all state labels already exist in both locales) and existing `chat.newConversation`/`chat.startConversation`. Add `home.continueChatAction`, `home.openConversations`, `home.recentConversations`, `home.firstRun*`, `home.planNotStartedChat*`, `home.reviewCompletedPlan`, `home.welcome`, `home.subtitle`. Both `en.json` and `ar.json` are updated in lock-step.

**Rationale**: Constitution X requires en/ar equality and forbids scattered hard-coded text. Reusing existing `coaching.*` keys avoids duplication; the new `home` namespace keeps Home-Dashboard-specific copy cohesive. The inspection confirmed `chat.backToDashboard` and `chat.continueConversation` do **not** exist, so any such labels are added under `home` (not assumed to exist).

**Alternatives considered**:
- Reusing `coaching.continueChat` for the continue-chat card — it exists, but its wording is plan-centric ("continue chat" in the plan view context); a dedicated `home.continueChatAction` keeps the Home Dashboard copy self-documenting. The exact reuse vs. new-key choice is a copy decision finalized in data-model.md.

## R9 — No persistence, no new queries beyond two

**Decision**: The Home Dashboard issues exactly the existing coaching-plan query plus one bounded conversation-list query. Create-conversation reuses the existing mutation. No `localStorage`/`sessionStorage`/IndexedDB; no new query endpoints.

**Rationale**: FR-025/FR-031 and the returning-user story US10 require every displayed value to come from a current API response. The composite state is derived per render. Constitution VI (privacy) and XII (simplicity).

**Alternatives considered**:
- Caching the selected continue-chat target in localStorage to "remember" it across visits — rejected (violates FR-020/FR-025 and breaks deterministic re-selection).

## R10 — Orchestration, not reimplementation (governing reuse rule)

**Decision**: The Home Dashboard is an orchestration layer over the existing Coaching and Chat features, never a replacement. It **composes existing hooks, queries, mutations, components, and state** — `useCoachingPlanQuery`, `useStartGenerationMutation`, `useAcceptPlanMutation`, `useUpdateActionStatusMutation`, `useCreateConversationMutation`, `CoachingPlanView`, `resolveDashboardView`/`CoachingDashboardView`, the `ConversationSummaryDto` shape, and the locale-aware `Link`/`useRouter` — and introduces new code **only** where orchestration or presentation is required: the shared `AppShell` + `TopNav` (AD-11), the three pure derivation modules (`home-dashboard-state.ts` / `home-primary-action.ts` / `home-chat.ts`, AD-10), the bounded recent-conversations helper + hook, the read-only recent list, and the plan/chat regions that wire the reused pieces together. The Home Dashboard MUST NOT recreate or re-implement any of: the **coaching state machine** (`resolveDashboardView`, the `CoachingDashboardView` set, `shouldPollPlan`, `shouldRetryPlanQuery`); `CoachingPlanView` and its accept/continue-chat/action controls; **conversation logic** (server-side ordering, active/archived filtering, URL recovery); **chat state handling** (`mapMessageState`, message routing, idempotency); the Spec 005 conversation-list sidebar; **existing mutations** and their invalidation; **existing polling** (`refetchInterval`/`shouldPollPlan`, 1500 ms, `MAX_TRANSIENT_RETRIES = 2`); or **existing routing behavior** (URL-based recovery, `routeForStep`, safety/eligibility redirects). It imports and composes them.

**Rationale**: The spec objective is maximal reuse; Constitution VIII (no duplication, no god components, single responsibility) and XII (simplicity) require it. Duplicating a tested state machine, polling policy, or chat view would double the maintenance surface and create divergence risk (e.g., the Home Dashboard's plan states drifting from the real coaching states). Enforced as architecture decision AD-0 in the plan and verified by a code-review/regression gate (`features/chat/*` and `features/coaching/*` unchanged; `features/home` imports the reused pieces).

**Alternatives considered**:
- Re-implementing a slimmed plan summary inside the Home Dashboard — rejected (duplicates `CoachingPlanView` and risks state drift).
- A parallel conversation-list component with its own sorting — rejected (duplicates backend ordering and the sidebar's behavior; the read-only recent list reuses the `ConversationSummaryDto` shape and the `labelFor` pattern without re-implementing sidebar actions).