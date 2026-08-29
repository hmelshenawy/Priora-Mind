# Tasks: Frontend Chatbot

**Input**: Design documents from `/specs/005-frontend-chatbot/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/chatbot-ui-contract.md, quickstart.md

**Tests**: Tests are included because Spec 005 success criteria explicitly require frontend integration tests, response-state tests, citation tests, responsive tests, linting, type checking, and build verification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)
- Every task includes exact file paths

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish chat feature structure and shared frontend test fixtures without changing backend behavior.

- [x] T001 Create the chat feature directory structure in `03-FRONTEND/src/features/chat/`
- [x] T002 Create the protected localized chat route directory structure in `03-FRONTEND/src/app/[locale]/(protected)/chat/`
- [x] T003 [P] Create shared chatbot E2E fixture helpers for authenticated user and Conversation API stubs in `03-FRONTEND/tests/e2e/chatbot-fixtures.ts`
- [x] T004 [P] Add English chat UI message keys for navigation, states, composer, actions, and citations in `03-FRONTEND/src/i18n/messages/en.json`
- [x] T005 [P] Add Arabic chat UI message keys for navigation, states, composer, actions, and citations in `03-FRONTEND/src/i18n/messages/ar.json`
- [x] T006 Verify Spec 004 conversation DTOs/enums are available from `shared/src/index.ts`; export existing required types only if already defined there and do not create duplicate frontend-owned API contract types

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core chat API, hooks, helpers, and state mapping required before any user story UI can be implemented.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T007 Implement `ConversationApiService` methods for list, create, retrieve, archive/unarchive, delete, and send using existing Conversation API paths in `03-FRONTEND/src/features/chat/chat.api.ts`
- [x] T008 Implement TanStack Query keys, list/detail queries, and mutation hooks for create, send, archive/unarchive, and delete in `03-FRONTEND/src/features/chat/chat-hooks.ts`
- [x] T009 Implement idempotency-key generation helper for send attempts in `03-FRONTEND/src/features/chat/chat-idempotency.ts`
- [x] T010 Implement backend response-state to UI-state mapping without inventing assistant content in `03-FRONTEND/src/features/chat/chat-state.ts`
- [x] T011 Implement citation display metadata formatter with title, section/heading, page/range, and fallback handling in `03-FRONTEND/src/features/chat/citation-format.ts`
- [x] T012 [P] Add focused Playwright coverage for idempotency-key uniqueness in `03-FRONTEND/tests/e2e/chatbot-idempotency.spec.ts`
- [x] T013 [P] Add focused Playwright coverage for backend response-state mapping in `03-FRONTEND/tests/e2e/chatbot-state-mapping.spec.ts`
- [x] T014 [P] Add focused Playwright coverage for citation formatting and fallback metadata in `03-FRONTEND/tests/e2e/chatbot-citations.spec.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin.

---

## Phase 3: User Story 1 - Start and Open Chat (Priority: P1) MVP

**Goal**: A qualified user opens chat from the current therapy/coaching plan, sees conversations, creates or continues a conversation, returns to the plan, and can recover the selected conversation from a URL after refresh or direct reopening.

**Independent Test**: Navigate from dashboard/coaching plan to chat, list conversations, create one if needed, open `/[locale]/chat/[conversationId]`, refresh, and return to the plan without creating unintended conversations.

### Tests for User Story 1

- [x] T015 [P] [US1] Add E2E test for opening chat from coaching plan and returning to plan in `03-FRONTEND/tests/e2e/chatbot.spec.ts`
- [x] T016 [P] [US1] Add E2E test for creating a conversation and navigating to `/en/chat/:conversationId` in `03-FRONTEND/tests/e2e/chatbot.spec.ts`
- [x] T017 [P] [US1] Add E2E test for direct open and refresh recovery from `/en/chat/:conversationId` using backend state in `03-FRONTEND/tests/e2e/chatbot.spec.ts`

### Implementation for User Story 1

- [x] T018 [US1] Implement chat list route page that renders chat without a selected conversation in `03-FRONTEND/src/app/[locale]/(protected)/chat/page.tsx`
- [x] T019 [US1] Implement selected conversation route page using URL param `conversationId` in `03-FRONTEND/src/app/[locale]/(protected)/chat/[conversationId]/page.tsx`
- [x] T020 [US1] Implement chat page shell with plan return action and selected conversation routing in `03-FRONTEND/src/features/chat/chat-page-view.tsx`
- [x] T021 [US1] Implement conversation list loading, empty, loaded, and failure states in `03-FRONTEND/src/features/chat/conversation-list.tsx`
- [x] T022 [US1] Implement conversation creation flow that opens the created conversation URL in `03-FRONTEND/src/features/chat/chat-page-view.tsx`
- [x] T023 [US1] Add open-chat and continue-chat controls to the coaching plan UI without changing plan business behavior in `03-FRONTEND/src/features/coaching/coaching-plan-view.tsx`
- [x] T024 [US1] Wire selected conversation recovery so route load refetches conversation detail from backend state in `03-FRONTEND/src/features/chat/chat-hooks.ts`

**Checkpoint**: User Story 1 is independently functional and testable as the MVP.

---

## Phase 4: User Story 2 - Send and Read Messages (Priority: P1)

**Goal**: A user sends a message in an open conversation and sees completed, clarification, insufficient-evidence, safety, and technical failure outcomes represented from backend state.

**Independent Test**: Open a conversation, submit a valid message, observe pending state, receive backend-provided user/assistant messages, and retry a failed send with a new idempotency key.

### Tests for User Story 2

- [x] T025 [P] [US2] Add focused composer validation test for empty and whitespace-only messages in `03-FRONTEND/tests/e2e/chatbot-composer.spec.ts`
- [x] T026 [P] [US2] Add E2E test for successful send showing user message, loading state, and completed assistant response in `03-FRONTEND/tests/e2e/chatbot.spec.ts`
- [x] T027 [P] [US2] Add E2E test for clarification and insufficient-evidence response rendering in `03-FRONTEND/tests/e2e/chatbot.spec.ts`
- [x] T028 [P] [US2] Add E2E test for technical failure retry using a new idempotency key and no retry endpoint in `03-FRONTEND/tests/e2e/chatbot.spec.ts`

### Implementation for User Story 2

- [x] T029 [US2] Implement message composer validation and duplicate-submit blocking in `03-FRONTEND/src/features/chat/message-composer.tsx`
- [x] T030 [US2] Implement message thread rendering with role distinction, chronological order, loading, completed, clarification, insufficient-evidence, safety, and failure states in `03-FRONTEND/src/features/chat/conversation-thread.tsx`
- [x] T031 [US2] Wire send-message mutation to create one idempotency key per send attempt in `03-FRONTEND/src/features/chat/chat-page-view.tsx`
- [x] T032 [US2] Implement failed-send retry flow that resubmits the same content with a new idempotency key in `03-FRONTEND/src/features/chat/chat-page-view.tsx`
- [x] T033 [US2] Ensure send mutation invalidates or updates conversation detail and list query state after final backend response in `03-FRONTEND/src/features/chat/chat-hooks.ts`

**Checkpoint**: User Story 2 is independently functional and testable with mocked backend response states.

---

## Phase 5: User Story 3 - Show Citations (Priority: P1)

**Goal**: Assistant messages with sources show readable citations, and messages without sources avoid misleading empty citation UI.

**Independent Test**: Load a conversation with cited assistant messages, verify source title/location/fallback rendering, and verify no citation section appears for messages without sources.

### Tests for User Story 3

- [x] T034 [P] [US3] Add E2E test for citations with source title, section, page, and page range in `03-FRONTEND/tests/e2e/chatbot.spec.ts`
- [x] T035 [P] [US3] Add E2E test for citation fallback metadata and hidden citation UI when sources are empty in `03-FRONTEND/tests/e2e/chatbot.spec.ts`

### Implementation for User Story 3

- [x] T036 [US3] Implement citation list component with accessible labels and fallback metadata in `03-FRONTEND/src/features/chat/citation-list.tsx`
- [x] T037 [US3] Integrate citation rendering into assistant messages only when sources exist in `03-FRONTEND/src/features/chat/conversation-thread.tsx`

**Checkpoint**: User Story 3 is independently functional and testable with citation fixture messages.

---

## Phase 6: User Story 4 - Manage Conversations (Priority: P2)

**Goal**: A user archives conversations from the default list and deletes conversations only after confirmation, while preserving visible state on operation failure.

**Independent Test**: Archive a conversation and confirm it leaves the default list, view archived conversations when returned by the backend, delete after confirmation, and verify failure states preserve prior UI.

### Tests for User Story 4

- [x] T038 [P] [US4] Add E2E test for archive success, archived view access, and archive failure state in `03-FRONTEND/tests/e2e/chatbot.spec.ts`
- [x] T039 [P] [US4] Add E2E test for delete confirmation, successful removal, and delete failure state in `03-FRONTEND/tests/e2e/chatbot.spec.ts`

### Implementation for User Story 4

- [x] T040 [US4] Add archive/unarchive controls and archived-list toggle behavior in `03-FRONTEND/src/features/chat/conversation-list.tsx`
- [x] T041 [US4] Add delete confirmation UI and success/failure handling in `03-FRONTEND/src/features/chat/conversation-list.tsx`
- [x] T042 [US4] Handle currently open conversation archive/delete navigation outcomes in `03-FRONTEND/src/features/chat/chat-page-view.tsx`

**Checkpoint**: User Story 4 is independently functional and testable for conversation management.

---

## Phase 7: User Story 5 - Use Chat on Common Screens (Priority: P2)

**Goal**: Chat remains usable on desktop and mobile-sized screens with readable Arabic and English content, reachable composer, navigation, messages, and citations.

**Independent Test**: Run responsive and RTL tests that complete primary chat navigation and message-reading tasks at desktop and mobile viewport sizes.

### Tests for User Story 5

- [x] T043 [P] [US5] Add responsive desktop and mobile chat layout test in `03-FRONTEND/tests/e2e/chatbot-responsive.spec.ts`
- [x] T044 [P] [US5] Add Arabic RTL chat layout and citation rendering test in `03-FRONTEND/tests/e2e/chatbot-rtl.spec.ts`

### Implementation for User Story 5

- [x] T045 [US5] Add responsive layout classes for desktop split view and mobile list/thread navigation in `03-FRONTEND/src/features/chat/chat-page-view.tsx`
- [x] T046 [US5] Ensure composer, message thread, and citations remain accessible without page-level horizontal scrolling in `03-FRONTEND/src/features/chat/conversation-thread.tsx`
- [x] T047 [US5] Verify chat labels and accessible text use localized strings in `03-FRONTEND/src/features/chat/chat-page-view.tsx`

**Checkpoint**: User Story 5 is independently functional and testable on desktop, mobile, English, and Arabic/RTL layouts.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Validate scope guardrails, quality gates, and documentation before implementation completion.

- [x] T048 [P] Confirm no frontend code calls Python RAG, Qdrant, LLM providers, streaming endpoints, summarization, title editing, agents/tools, or a retry endpoint in `03-FRONTEND/src/`
- [x] T049 [P] Confirm all touched handwritten source files stay under the 300-line limit in `03-FRONTEND/src/features/chat/`
- [x] T050 Run frontend Playwright tests with `npm -w 03-FRONTEND run test` from repository root
- [x] T051 Run frontend lint with `npm -w 03-FRONTEND run lint` from repository root
- [x] T052 Run frontend production build and TypeScript check with `npm -w 03-FRONTEND run build` from repository root
- [x] T053 Update quickstart validation notes if implementation-specific route or existing repository-approved URL state pattern differs from `/[locale]/chat/[conversationId]` in `specs/005-frontend-chatbot/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion - blocks all user stories.
- **User Stories (Phase 3+)**: Depend on Foundational completion.
- **Polish (Phase 8)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - no dependency on other stories. This is the MVP entry/recovery slice.
- **User Story 2 (P1)**: Can start after Foundational but needs an open conversation route from US1 for full E2E flow; component-level work can proceed in parallel.
- **User Story 3 (P1)**: Can start after Foundational; integrates with the message thread from US2 for final display.
- **User Story 4 (P2)**: Can start after Foundational and conversation list from US1.
- **User Story 5 (P2)**: Can start after the relevant UI shells from US1-US3 exist.

### Within Each User Story

- Tests should be written before implementation and fail first when practical.
- Shared helpers/hooks before route/page integration.
- Component behavior before cross-route E2E validation.
- Each story reaches a checkpoint before adding lower-priority stories.

---

## Parallel Opportunities

- T003, T004, T005, and T006 can run in parallel after directories exist.
- T012, T013, and T014 can run in parallel after T009-T011 define helper behavior.
- US1 tests T015-T017 can be drafted in parallel with route implementation tasks T018-T020.
- US2 tests T025-T028 can be drafted in parallel with composer/thread implementation tasks T029-T030.
- US3 tests T034-T035 can be drafted in parallel with citation component T036.
- US4 tests T038-T039 can be drafted in parallel with archive/delete UI tasks T040-T041.
- US5 tests T043-T044 can be drafted in parallel with responsive implementation tasks T045-T047.
- Polish checks T048-T049 can run in parallel before final commands T050-T052.

---

## Parallel Example: User Story 1

```text
Task: "T015 [US1] Add E2E test for opening chat from coaching plan and returning to plan in 03-FRONTEND/tests/e2e/chatbot.spec.ts"
Task: "T016 [US1] Add E2E test for creating a conversation and navigating to /en/chat/:conversationId in 03-FRONTEND/tests/e2e/chatbot.spec.ts"
Task: "T017 [US1] Add E2E test for direct open and refresh recovery from /en/chat/:conversationId using backend state in 03-FRONTEND/tests/e2e/chatbot.spec.ts"
```

## Parallel Example: User Story 2

```text
Task: "T025 [US2] Add focused composer validation test for empty and whitespace-only messages in 03-FRONTEND/tests/e2e/chatbot-composer.spec.ts"
Task: "T026 [US2] Add E2E test for successful send showing user message, loading state, and completed assistant response in 03-FRONTEND/tests/e2e/chatbot.spec.ts"
Task: "T028 [US2] Add E2E test for technical failure retry using a new idempotency key and no retry endpoint in 03-FRONTEND/tests/e2e/chatbot.spec.ts"
```

## Parallel Example: User Story 3

```text
Task: "T034 [US3] Add E2E test for citations with source title, section, page, and page range in 03-FRONTEND/tests/e2e/chatbot.spec.ts"
Task: "T036 [US3] Implement citation list component with accessible labels and fallback metadata in 03-FRONTEND/src/features/chat/citation-list.tsx"
```

## Parallel Example: User Story 4

```text
Task: "T038 [US4] Add E2E test for archive success, archived view access, and archive failure state in 03-FRONTEND/tests/e2e/chatbot.spec.ts"
Task: "T039 [US4] Add E2E test for delete confirmation, successful removal, and delete failure state in 03-FRONTEND/tests/e2e/chatbot.spec.ts"
```

## Parallel Example: User Story 5

```text
Task: "T043 [US5] Add responsive desktop and mobile chat layout test in 03-FRONTEND/tests/e2e/chatbot-responsive.spec.ts"
Task: "T044 [US5] Add Arabic RTL chat layout and citation rendering test in 03-FRONTEND/tests/e2e/chatbot-rtl.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: User Story 1.
4. Stop and validate chat entry, conversation list, create/open, URL recovery, and return-to-plan behavior.

### Incremental Delivery

1. Add US1 for plan/chat navigation and recovery.
2. Add US2 for message send/read and retry behavior.
3. Add US3 for citations.
4. Add US4 for archive/delete.
5. Add US5 for responsive and RTL polish.
6. Run Phase 8 quality gates.

### Scope Guardrails

- Do not add backend endpoints or change Spec 004 backend behavior.
- Do not call Python RAG, Qdrant, or LLM providers from frontend code.
- Do not add streaming, agents/tools, summarization, title editing, or a retry endpoint.
- Do not add local conversation persistence beyond existing application architecture.
- Reuse Spec 004 DTOs/enums from `@priora/shared-types`; modify shared exports only if required existing types are present but not exported.
