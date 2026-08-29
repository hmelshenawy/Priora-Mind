# Tasks: Post-Onboarding Home Dashboard

**Input**: Design documents from `specs/006-home-dashboard/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md — all present.

**Tests**: Included. The plan's Testing Strategy is **Playwright-only** (the repo has no Vitest/Jest/RTL). Two new e2e files are deliverables: `tests/e2e/home-dashboard-state.spec.ts` (pure state logic) and `tests/e2e/home-dashboard.spec.ts` (journeys). Test tasks are folded into the phases that own the logic they cover.

**Organization**: Tasks are grouped by user story (spec.md US1–US10) in priority order (P1 → P2). Each story is an independently testable increment. All paths are relative to `03-FRONTEND/` unless noted.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Which user story this task belongs to (US1…US10). Setup/Foundational/Polish tasks carry NO story label.
- Exact file paths are included in every description.

## Path Conventions

- Frontend app root: `03-FRONTEND/`
- New feature module: `03-FRONTEND/src/features/home/`
- New co-located layouts: `03-FRONTEND/src/app/[locale]/(protected)/{dashboard,chat}/layout.tsx`
- Tests: `03-FRONTEND/tests/e2e/`
- i18n: `03-FRONTEND/src/i18n/messages/{en,ar}.json`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: One-time shadcn/ui initialization (AD-8). Primitives are used only by new `features/home/*` files and the two co-located layouts — existing `features/chat/*` and `features/coaching/*` are NOT migrated.

- [X] T001 Initialize shadcn/ui in `03-FRONTEND` — run `npx shadcn@latest init` to produce `components.json` + `src/lib/utils.ts` (`cn` helper); this is an **incremental adoption, not a UI migration** — initialize without redesigning the application, preserve the existing Tailwind design tokens (slate palette, `rounded-3xl`/`rounded-full`, `text-start`, `focus-visible:ring`), do NOT rewrite Chat (`features/chat/*`), do NOT rewrite Coaching (`features/coaching/*`), and do NOT migrate unrelated pages; **review every file the CLI modifies or creates before accepting it** and revert any unintended edits to existing files. (AD-8)
- [X] T002 Add shadcn primitives Button + Card via `npx shadcn@latest add button card` into `03-FRONTEND/src/components/ui/{button,card}.tsx` — install ONLY the primitives Spec 006 requires (Button, Card), token-matched, consumed only by `features/home/*` + the two co-located layouts; do not add unrelated primitives and do not migrate existing features; review the generated files before accepting them; depends on T001. (AD-8)

**Checkpoint**: shadcn primitives available; no existing feature edited.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared, framework-free state modules, the dedicated chat data layer, and the shared chrome (AppShell + TopNav + co-located layouts) that EVERY user story renders within. No user story may begin until this phase is complete.

**⚠️ CRITICAL**: Blocks all user stories.

- [X] T003 [P] Create pure state-derivation module `03-FRONTEND/src/features/home/home-dashboard-state.ts` — export `HomeDashboardState` (the existing `CoachingDashboardView` set plus `'firstRun'`) and `resolveHomeDashboardView({ coachingView, conversationsQuery: { status, items } })`; assert `firstRun` only when `coachingView === 'startable'` AND `conversationsQuery.status === 'success'` AND `items.length === 0` (never on loading/error). No React, no I/O. (AD-10, AD-9)
- [X] T004 Create pure primary-action module `03-FRONTEND/src/features/home/home-primary-action.ts` — export `PrimaryAction` type and `resolvePrimaryAction(state)` implementing the FR-035 mapping; import the `HomeDashboardState` type from `home-dashboard-state.ts` (one-directional, no cycle; depends on the T003 type definition). No React, no I/O. (AD-10)
- [X] T005 [P] Create pure continue-chat target module `03-FRONTEND/src/features/home/home-chat.ts` — export `selectContinueChatTarget(activeConversations)` returning `items[0]` (server-sorted `updatedAt desc, id desc`) or `undefined`; import only `ConversationSummaryDto`. No React, no I/O. (AD-10, FR-017)
- [X] T006 [P] Create recent-conversations helper `03-FRONTEND/src/features/home/home.api.ts` — export `HOME_RECENT_CONVERSATIONS_LIMIT = 5` and `getRecentConversations(limit)` calling `GET /api/v1/conversations?includeArchived=false&limit=${limit}` via the shared `apiFetch`; leaves `features/chat/chat.api.ts` untouched. (AD-6, SC-001)
- [X] T007 Create `03-FRONTEND/src/features/home/home-hooks.ts` — export `useRecentConversationsQuery(limit)` with key `['chat','conversations','recent',{limit}]` (descendant of `['chat','conversations']`), `retry: false`, no `refetchInterval` (no polling); depends on T006. (AD-6)
- [X] T008 [P] Create `03-FRONTEND/src/features/home/home-top-nav.tsx` — accessible `<nav>` with Home (`/dashboard`), Plan (`/dashboard#coaching-plan`), Chat (`/chat`) links via the locale-aware `Link` from `i18n/navigation`; active state from `usePathname()` plus the URL hash (read in a client effect); `aria-current="page"` on the active link. (AD-5, FR-022a)
- [X] T009 Create `03-FRONTEND/src/features/home/app-shell.tsx` — render `<TopNav/>` above `{children}` and nothing else; deliberately NO page container, `min-h-screen`, or `<main>` (each page owns its own; chat page's `min-h-screen` root is Spec-005-preserved); depends on T008. (AD-11)
- [X] T010 Create `03-FRONTEND/src/app/[locale]/(protected)/dashboard/layout.tsx` — composes `<AppShell>{children}</AppShell>`; depends on T009. (AD-11, FR-022a)
- [X] T011 Create `03-FRONTEND/src/app/[locale]/(protected)/chat/layout.tsx` — composes `<AppShell>{children}</AppShell>` (covers `/chat` and `/chat/[conversationId]`); depends on T009. (AD-11, FR-022a)
- [X] T012 Create pure-state Playwright coverage `03-FRONTEND/tests/e2e/home-dashboard-state.spec.ts` — assert `resolveHomeDashboardView` (including `firstRun` NOT asserted while conversations loading/errored), `resolvePrimaryAction` (FR-035 per state), `selectContinueChatTarget` (deterministic `items[0]`); mirror the existing `coaching-dashboard-state.spec.ts` e2e style; depends on T003–T005.

**Checkpoint**: Foundation ready — state modules, chat data layer, shared chrome, and pure-state tests in place. User story implementation can begin.

---

## Phase 3: User Story 1 — See my current coaching state and next action (Priority: P1) 🎯 MVP

**Goal**: The Home Dashboard shell renders the welcome/header, the current coaching-plan state (every state), and the single recommended next action — without exercising any chat feature.

**Independent Test**: Log in as a post-onboarding user in each coaching state and verify the correct state label, the correct recommended next action, and the welcome header render on `/dashboard`.

### Implementation for User Story 1

- [X] T013 [US1] Create `03-FRONTEND/src/features/home/home-plan-region.tsx` — always render the synchronous wrapper `<section id="coaching-plan">`; render every coaching state with the correct label and a primary-action **guidance label**; local `StateCard` helper (extracted from the current dashboard) for non-ready states; reuse `<CoachingPlanView/>` (props threaded, NOT modified) for the READY states and render NO competing Home-level CTA button for READY states (AD-2/AD-4, FR-036a); single Home-level CTA button only for `startable`/`firstRun`/`failedRetryable` (handlers wired in later stories — start in US2, retry in US3).
- [X] T014 [US1] Create `03-FRONTEND/src/features/home/home-dashboard-view.tsx` — wire the reused `useCoachingPlanQuery`; compute `HomeDashboardState` + `PrimaryAction` via the pure modules (T003/T004); render a welcome header + `<HomePlanRegion/>` in strict FR-032 order inside a `<main>`; mount a `useEffect` that scrolls `#coaching-plan` into view on hash change (and on initial mount with a hash) for reliable Plan-anchor navigation (AD-5); depends on T013.
- [X] T015 [US1] Modify `03-FRONTEND/src/app/[locale]/(protected)/dashboard/page.tsx` in place — replace the inline coaching-only body with `<HomeDashboardView …/>`; KEEP `RequireOnboarding`, the auto-start-on-`PLAN_NOT_FOUND` effect (the single plan-generation flow, Spec 002 preserved — AD-7), and the `ONBOARDING_STEP_BLOCKED`/`SAFETY_HOLD` redirect effects (route-level); thread query/mutation handles + labels into the view; existing relative imports unchanged; stays ≤ 300 lines; depends on T014.
- [X] T016 [P] [US1] Add `home.*` (plan-region labels/state cards) and `nav.*` (Home/Plan/Chat) keys to `03-FRONTEND/src/i18n/messages/en.json`.
- [X] T017 [P] [US1] Add the matching `home.*` + `nav.*` keys in Arabic to `03-FRONTEND/src/i18n/messages/ar.json` (RTL-ready).
- [X] T018 [US1] Add coaching-state journeys to `03-FRONTEND/tests/e2e/home-dashboard.spec.ts` — for `loading`, `startable`, `pending`/`generating`, `readyProposed`, `readyActive`, `readyCompleted`: assert the correct state label and the FR-035 recommended next action render; no chat region exercised yet; depends on T015.

**Checkpoint**: US1 fully functional and independently testable — the Home Dashboard shell shows coaching state + next action.

---

## Phase 4: User Story 2 — Start plan generation when no plan exists (Priority: P1)

**Goal**: A user with no plan can start generation from the Home Dashboard; the page transitions to pending/generating and polls only while `PENDING`/`GENERATING`.

**Independent Test**: Use a freshly onboarded account with no plan; verify the start action is present, triggers generation, and the page transitions to the generating state.

### Implementation for User Story 2

- [X] T019 [US2] Wire the shared start-generation mutation into `home-plan-region.tsx` + `home-dashboard-view.tsx` — the no-plan state uses the preserved auto-start-on-`PLAN_NOT_FOUND` effect as the **single generation flow** (AD-7); the explicit no-plan/`firstRun` CTA invokes the SAME `useStartGenerationMutation` and is coordinated with auto-start via the existing start-requested guard (so the two triggers never double-fire) — it is a fallback for the transient frame before auto-start fires (FR-006), NOT a separate manual generation flow, and no second generation flow is introduced; hide the CTA while `pending`/`generating` (FR-011).
- [X] T020 [US2] Add a no-plan generation journey to `03-FRONTEND/tests/e2e/home-dashboard.spec.ts` — the no-plan state relies on the auto-start effect (the single generation flow) → `pending`/`generating`; the explicit CTA is a fallback invoking the same mutation and never double-fires with auto-start; assert polling occurs only while `PENDING`/`GENERATING` and stops on `READY` (SC-004); depends on T019.

**Checkpoint**: US2 complete — plan generation is reachable from the Home Dashboard.

---

## Phase 5: User Story 5 — Continue an existing conversation (Priority: P1)

**Goal**: A user with conversations can continue the single most-recently-updated active conversation by URL, and open the conversation list.

**Independent Test**: Use an account with several conversations with distinct last-update times; verify the continue-chat card deterministically targets the single most-recently-updated active conversation and navigates to its URL.

### Implementation for User Story 5

- [X] T021 [US5] Create `03-FRONTEND/src/features/home/home-chat-region.tsx` — render the continue-chat card targeting `selectContinueChatTarget` (T005) and an "open conversations" link to `/chat`; render its OWN loading/empty/error surface (AD-9) with a manual retry (`refetch()`) on error that never hides the plan region; consume `useRecentConversationsQuery` (T007); continue-chat card hidden when there is no active conversation.
- [X] T022 [US5] Wire the conversations query into `home-dashboard-view.tsx` — call `useRecentConversationsQuery(HOME_RECENT_CONVERSATIONS_LIMIT)`; compute the composite `HomeDashboardState` using the conversations query **status**; render `<HomeChatRegion/>` after `<HomePlanRegion/>` in FR-032 order; pass `continueTarget` and `conversationsQueryStatus`; depends on T021.
- [X] T023 [US5] Add a continue-chat journey to `03-FRONTEND/tests/e2e/home-dashboard.spec.ts` — deterministic target = most-recently-updated active conversation; clicking navigates to `/chat/{id}`; refresh stays in the same conversation (SC-005); "open conversations" navigates to `/chat` (FR-018); depends on T022.

**Checkpoint**: US5 complete — continue-chat works with URL recovery preserved.

---

## Phase 6: User Story 6 — Start a new conversation (Priority: P1)

**Goal**: A user can start a brand-new conversation from the Home Dashboard and lands on the new conversation's URL.

**Independent Test**: Use any post-onboarding account; verify the start-new-conversation action creates a conversation and navigates the user to it.

### Implementation for User Story 6

- [X] T024 [US6] Add the start-new-conversation action to `home-chat-region.tsx` — bind to the reused `useCreateConversationMutation` and navigate to `/chat/{newConversation.id}` on success (FR-019, FR-020); matches the existing `ChatPageView` pattern.
- [X] T025 [US6] Add a start-new-conversation journey to `03-FRONTEND/tests/e2e/home-dashboard.spec.ts` — action creates a conversation and lands on its URL; URL-based recovery applies to the new conversation (SC-006); depends on T024.

**Checkpoint**: US6 complete — new conversations are reachable from the Home Dashboard.

---

## Phase 7: User Story 3 — Explicitly retry a retryable failed plan (Priority: P2)

**Goal**: A user with a retryable failed plan sees an explicit "try again" action; no automatic retry occurs; triggering it begins a new generation attempt.

**Independent Test**: Place an account in a `FAILED` + retryable state; verify the retry action is present, no automatic retry occurs, and triggering it begins a new generation attempt.

### Implementation for User Story 3

- [X] T026 [US3] Add failed-retryable + unavailable rendering to `home-plan-region.tsx` — `failedRetryable` `StateCard` + an explicit "try again" CTA bound to the same `useStartGenerationMutation` (the only manual trigger of the single generation flow, for the failed-retryable case; no automatic retry — FR-012); `unavailable` (non-retryable) shows guidance with NO retry CTA; no auto-retry, no polling in either terminal state (FR-007, FR-008, SC-003).
- [X] T027 [US3] Add failed-retryable + unavailable journeys to `03-FRONTEND/tests/e2e/home-dashboard.spec.ts` — retry CTA present; doing nothing triggers no polling; retry → `pending`/`generating`; unavailable → no retry CTA and no polling (SC-004); depends on T026.

**Checkpoint**: US3 complete — retryable failures are user-controlled.

---

## Phase 8: User Story 4 — View, accept, continue, and review a plan (Priority: P2)

**Goal**: A user with a ready/active/completed plan can view it, accept a proposed plan, continue an active plan, and review a completed plan — using only existing coaching capabilities.

**Independent Test**: Use accounts with a ready-proposed, an active, and a completed plan; verify view, accept, continue, and review actions render and behave correctly from the Home Dashboard.

### Implementation for User Story 4

- [X] T028 [US4] Add accept/continue/review to `home-plan-region.tsx` — `readyProposed`: accept CTA bound to `useAcceptPlanMutation` (FR-009); `readyActive`: continue via `<CoachingPlanView/>`'s action controls bound to `useUpdateActionStatusMutation` (FR-010); `readyCompleted`: "review your completed plan" wording (NOT "continue your plan"), read-only plan view + standing continue-chat option, and NO new-plan CTA (FR-010a); thread `CoachingPlanView` props from the page; no Home-level CTA button competes with `CoachingPlanView` for READY states (AD-2/AD-4).
- [X] T029 [US4] Add accept/continue/review journeys to `03-FRONTEND/tests/e2e/home-dashboard.spec.ts` — accept → `readyActive`; continue exposes the next available action; completed shows "review your completed plan" + continue-chat and offers NO new-plan generation; plan details render from existing data with no invented fields; depends on T028.

**Checkpoint**: US4 complete — plan engagement is reachable and the completed plan is honest.

---

## Phase 9: User Story 7 — Ineligible or safety-held user receives existing guidance (Priority: P2)

**Goal**: Users who are ineligible or safety-held receive the existing guidance/redirects and are never offered normal coaching actions.

**Independent Test**: Use accounts in each ineligible state; verify the Home Dashboard redirects or shows existing guidance and offers no plan-generation, accept, or continue action.

### Implementation for User Story 7

- [X] T030 [US7] Add eligibility/safety states to `home-plan-region.tsx` — `noAssessment` (existing guidance, no start action), `safetyHold`/`ineligible` (existing guidance, NO coaching CTA — redirects remain route-level effects in `dashboard/page.tsx`), `notReady`/`notActive` (manual refetch only) (FR-013–FR-016, FR-026, SC-008); no new eligibility rules or safety copy (FR-016).
- [X] T031 [US7] Add ineligible/safety/no-assessment journeys to `03-FRONTEND/tests/e2e/home-dashboard.spec.ts` — onboarding block redirects to the correct unfinished step; no-assessment shows existing guidance with no start; safety-hold routes to the existing surface with no coaching CTA; assert `TopNav` is absent on `/assessment` (layout-scope gate, AD-11); depends on T030.

**Checkpoint**: US7 complete — safety/eligibility boundaries are preserved.

---

## Phase 10: User Story 9 — First-time user with no plan and no conversations (Priority: P2)

**Goal**: A brand-new post-onboarding user with no plan and no conversations lands on a dedicated first-run experience (not an empty/error screen); a plan-exists-no-conversations user sees the plan normally with a "start your first conversation" prompt.

**Independent Test**: Use a freshly onboarded account with no plan and no conversations; verify the first-run state with both recommended actions and no error messaging.

### Implementation for User Story 9

- [X] T032 [US9] Implement the first-run experience across `home-plan-region.tsx` + `home-chat-region.tsx` — `firstRun` `StateCard` ("generate your first coaching plan") whose CTA invokes the same `useStartGenerationMutation` as the auto-start fallback (AD-7; the single generation flow — not a separate trigger), with the chat-first action secondary; "start your first conversation" entry point; FR-002b: when a plan exists but there are no conversations, the plan region renders normally and the chat region shows a "not started yet" prompt (not an error); confirm `firstRun` is never asserted while the conversations query is loading/errored (state module + view wiring); the start-new action reuses US6 wiring.
- [X] T033 [US9] Add first-run journeys to `03-FRONTEND/tests/e2e/home-dashboard.spec.ts` — no plan + no conversations → first-run (both actions, no error/empty messaging); plan + no conversations → FR-002b prompt; no plan + conversations → `startable` (NOT first-run); depends on T032.

**Checkpoint**: US9 complete — the empty-but-valid state is intentional onboarding guidance.

---

## Phase 11: User Story 10 — Returning user after time away (Priority: P2)

**Goal**: A returning user's Home Dashboard immediately reflects the current plan status, primary next action, most-recently-updated active conversation, and recent conversations — entirely from live API responses, with no local persistence.

**Independent Test**: Use an account with a plan and conversations, close the session, reopen the Home Dashboard; verify it immediately shows current state from live APIs with no persisted local state.

### Implementation for User Story 10

- [X] T034 [US10] Verify returning-user reconstruction in `03-FRONTEND/tests/e2e/home-dashboard.spec.ts` — close/reopen → current coaching-plan status + primary next action + continue-chat target + recent conversations all from live API responses; assert NO `localStorage`/`sessionStorage`/`indexedDB` writes by the Home Dashboard (FR-025, FR-031, SC-014); implementation is already complete from US1/US5/US9 — this task is verification + regression.

**Checkpoint**: US10 complete — returning users get an accurate, persistence-free Home Dashboard.

---

## Phase 12: User Story 8 — Works on desktop, mobile, English, and Arabic/RTL (Priority: P2)

**Goal**: The Home Dashboard reflows responsively across desktop and mobile and is fully localized in English and Arabic with correct RTL mirroring.

**Independent Test**: Render the Home Dashboard at mobile and desktop widths in both locales; verify layout reflow, complete translations, and correct RTL mirroring.

### Implementation for User Story 8

- [X] T035 [US8] Apply responsive + RTL across `home-dashboard-view.tsx`, `home-plan-region.tsx`, `home-chat-region.tsx`, and `home-top-nav.tsx` — mobile-first single column using existing `container`/`px-4`/`md:` breakpoints; recent-conversations list `hidden sm:block` (FR-023 SHOULD on very small viewports) while continue-chat/start-new stay visible; `min-w-0` on flex children + `overflow-x-hidden` (SC-009); logical properties / `text-start` / `flex` ordering so RTL mirrors automatically (FR-028, FR-029).
- [X] T036 [US8] Add a responsive + Arabic/RTL journey to `03-FRONTEND/tests/e2e/home-dashboard.spec.ts` — mobile-width viewport: single-column, no horizontal overflow; Arabic locale: all Home Dashboard content translated and laid out right-to-left (SC-009); depends on T035.

**Checkpoint**: US8 complete — the Home Dashboard meets localization and responsive standards.

---

## Phase 13: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates that span all user stories.

- [X] T037 [P] Run build quality gates in `03-FRONTEND`: `npm run lint`, `npx tsc --noEmit`, `npm run build` (SC-011).
- [X] T038 Run the full Playwright suite in `03-FRONTEND` (`npx playwright test`) — new `home-dashboard-state.spec.ts` + `home-dashboard.spec.ts` pass, and existing `coaching-plan.spec.ts`, `coaching-dashboard-state.spec.ts`, and chat e2e pass unchanged (SC-011).
- [X] T039 [P] Run scope gates: `grep -rniE "rag|qdrant|ollama|openai|llm|python" 03-FRONTEND/src/features/home` → no matches (SC-010); `grep -rniE "localStorage|sessionStorage|indexedDB" 03-FRONTEND/src/features/home` → no matches (FR-025/FR-031); `grep -rn "AppShell" 03-FRONTEND/src/app` → only the two layouts (AD-11); `grep -rn "TopNav" 03-FRONTEND/src/features/home` → only `app-shell.tsx`; `git diff --stat -- 03-FRONTEND/src/features/chat 03-FRONTEND/src/features/coaching` → no changes (AD-0, FR-030).
- [X] T040 [P] File-size gate: confirm every new handwritten file under `03-FRONTEND/src/features/home/` and the two new layouts is ≤ 300 lines (Constitution VIII).

**Checkpoint**: All gates green; implementation ready for review.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1 (shadcn primitives used by regions/layouts). BLOCKS all user stories.
- **User Stories (Phases 3–12)**: All depend on Phase 2. Execute in priority order: P1 first (US1 → US2 → US5 → US6), then P2 (US3 → US4 → US7 → US9 → US10 → US8).
- **Polish (Phase 13)**: Depends on all user stories being complete.

### Within Foundational (Phase 2)

- T003 (state module + `HomeDashboardState` type) first, then T004 (imports that type) — sequential; T005 and T006 are independent of T003/T004 and parallel with them.
- T006 then T007 (helper then hook that imports it) — sequential.
- T008 then T009 (TopNav then AppShell that renders it) — sequential; T010 and T011 are parallel with each other but both depend on T009.
- T012 (pure-state tests) after T003–T005.

### Within Each User Story

- Region/component creation before view wiring; view wiring before `page.tsx` wiring; i18n (en/ar) parallel; journey tests after the implementation tasks they cover.
- Several stories edit the same three files (`home-dashboard-view.tsx`, `home-plan-region.tsx`, `home-chat-region.tsx`) — those tasks are sequential across stories (priority order prevents file conflicts).

### User Story Dependencies

- **US1 (P1)**: After Phase 2. No story dependencies. MVP.
- **US2 (P1)**: After US1 (wires the start CTA US1 rendered).
- **US5 (P1)**: After US1 (adds the chat region to the view US1 created).
- **US6 (P1)**: After US5 (adds start-new to the chat region US5 created).
- **US3 (P2)**: After US2 (retry reuses the start mutation wiring).
- **US4 (P2)**: After US1 (adds accept/continue/review to the plan region US1 created).
- **US7 (P2)**: After US1 (adds eligibility/safety states to the plan region).
- **US9 (P2)**: After US1 + US6 (first-run reuses the start CTA + start-new wiring).
- **US10 (P2)**: After US1 + US5 + US9 (verification only).
- **US8 (P2)**: After US1–US7 + US9 (applies responsive/RTL across all built surfaces).

### Parallel Opportunities

- Phase 1: T002 parallel with nothing else (T001 is sequential prerequisite).
- Phase 2: T003/T004/T005 parallel; T006 parallel with the pure modules; T008 parallel with T003–T007; T010/T011 parallel after T009.
- Within US1: T016 (en) ∥ T017 (ar) i18n in parallel with T013–T015.
- Phase 13: T037, T039, T040 are independent gates (parallel); T038 runs after the implementation is complete.

---

## Parallel Example: Foundational Phase

```bash
# Independent files (parallel):
Task T003: "home-dashboard-state.ts"   # defines HomeDashboardState type
Task T005: "home-chat.ts"
Task T006: "home.api.ts"
Task T008: "home-top-nav.tsx"

# After T003 (type definition before consumer):
Task T004: "home-primary-action.ts"     # imports HomeDashboardState from T003

# Then sequentially:
Task T007: "home-hooks.ts" (imports T006)
Task T009: "app-shell.tsx" (renders T008's TopNav)

# After T009 (parallel with each other; both depend on T009):
Task T010: "dashboard/layout.tsx"
Task T011: "chat/layout.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (shadcn init + primitives).
2. Complete Phase 2: Foundational (state modules, chat data layer, AppShell/TopNav/layouts, pure-state tests) — CRITICAL, blocks all stories.
3. Complete Phase 3: User Story 1 (coaching state + next action shell).
4. **STOP and VALIDATE**: run `home-dashboard-state.spec.ts` + the US1 coaching-state journeys; verify the Home Dashboard renders every coaching state with the correct label and recommended action.
5. Demo if ready.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → test independently → MVP (Home Dashboard shell with coaching state + next action).
3. US2 → test independently → plan generation reachable.
4. US5 → test independently → continue-chat works.
5. US6 → test independently → start-new works.
6. US3 / US4 / US7 / US9 / US10 / US8 → each tested independently → full Home Dashboard.
7. Phase 13 Polish → all gates green.

### MVP Scope

**MVP = US1 only.** It delivers the foundational Home Dashboard shell (welcome header + every coaching state + the single recommended next action) and exercises the full vertical slice (pure modules → view → `page.tsx` wiring → i18n → e2e). Every subsequent story extends regions already created by US1.

---

## Notes

- [P] tasks = different files, no dependency on an incomplete task.
- [Story] label maps a task to its user story for traceability.
- Each user story is independently completable and testable.
- Commit after each task or logical group; the `before_implement`/`after_implement` git hooks are optional.
- Stop at any checkpoint to validate a story independently.
- The repo's ONLY test runner is Playwright — do not introduce Vitest/Jest/RTL.
- Do NOT edit `features/chat/*` or `features/coaching/*` (AD-0, FR-030); the chat pages inherit `TopNav` only via the new sibling `chat/layout.tsx` composing `<AppShell/>`.
- **Single plan-generation flow (AD-7):** the preserved auto-start-on-`PLAN_NOT_FOUND` effect is the one generation flow. The explicit no-plan/`firstRun` CTA and the failed-retryable retry CTA invoke the SAME `useStartGenerationMutation` (coordinated with auto-start via the existing start-requested guard so they never double-fire) — they are fallbacks, NOT a second generation flow; failed generation is never retried automatically (FR-012).
- **shadcn/ui adoption is incremental (AD-8):** install only Button + Card, preserve the existing Tailwind tokens, do not migrate `features/chat/*`, `features/coaching/*`, or unrelated pages; review every file the CLI modifies before accepting it.
- Verify tests fail before implementing the code they cover (TDD where practical).
