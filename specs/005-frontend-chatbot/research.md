# Research: Frontend Chatbot

## Decision: Use the existing Conversation API as the only chat data boundary

**Rationale**: Spec 004 defines create, list, retrieve, archive/unarchive, delete, and send-message behavior. Spec 005 is a frontend feature and must not invent backend APIs or change backend assumptions.

**Alternatives considered**: Direct Python RAG calls, direct Qdrant calls, direct LLM provider calls, or a frontend-specific chat gateway. All are rejected because they violate Spec 005 constraints, SAD.md boundaries, and the constitution.

## Decision: Use TanStack Query for conversations and messages

**Rationale**: Frontend_Architecture.md separates server state from client UI state, and the current coaching plan flow already uses TanStack Query. Conversation list, conversation detail, archive/delete, and send outcomes are server state.

**Alternatives considered**: Manual component-level fetch state or global client store. Manual fetch state would duplicate established patterns; global client store would add unnecessary persistence and complexity.

## Decision: Recover conversations from URL identity and backend state, not local persistence

**Rationale**: Spec 005 requires recovery after refresh, revisit, direct reopening, or reopening from plan using existing routing architecture and backend conversation state. The selected conversation should be URL-addressable, preferably as `/[locale]/chat/[conversationId]`, so route reload can refetch the conversation detail without relying on temporary component state.

**Alternatives considered**: Persisting full conversation history locally or storing selected conversation only in client component state. Rejected for privacy, duplication, and loss of recovery after refresh/direct open.

## Decision: Keep message sending synchronous and non-streaming

**Rationale**: Spec 004 returns persisted user and assistant messages in one send response. Spec 005 explicitly excludes streaming.

**Alternatives considered**: Streaming UI, optimistic streaming buffer, or partial assistant messages. Rejected as out of MVP scope.

## Decision: Retry failed sends with a new idempotency key

**Rationale**: Spec 004 states reusing the same idempotency key returns the stored result, including failures. A new send attempt with a new idempotency key is the MVP retry mechanism.

**Alternatives considered**: Dedicated retry endpoint or same-key reprocessing. Both are rejected by Spec 004 and Spec 005 constraints.

## Decision: Treat citations as message-level display data

**Rationale**: Spec 004 persists citation snapshots with assistant messages. The frontend should render what the backend returns without re-querying RAG or reconstructing sources.

**Alternatives considered**: Fetch source details directly from RAG or rebuild citations from document metadata. Rejected because frontend must not call RAG and citations must remain stable snapshots.

## Decision: Integrate chat navigation through the existing coaching plan/dashboard flow

**Rationale**: Spec 005 is a navigation and UX integration with the therapy/coaching plan. The plan view should offer a chat entry point, return path, and continue-chat path without adding AI capabilities or backend behavior.

**Alternatives considered**: Separate standalone chat product area disconnected from the plan, or plan-specific AI behavior. Rejected because the MVP must preserve the structured coaching journey.

## Decision: Use Playwright for frontend acceptance coverage

**Rationale**: The frontend workspace currently uses Playwright for E2E tests. The Spec 005 success criteria are development-verifiable through route, API interception, state rendering, responsive, RTL, and focused component/unit-style tests where the existing Playwright setup supports them.

**Alternatives considered**: Adding a new unit-test runner. Rejected as unnecessary for this MVP planning phase.

## Decision: Reuse Spec 004 shared DTOs and enums

**Rationale**: The frontend and backend already share cross-stack DTOs through `@priora/shared-types`. Chat API types should come from the existing Spec 004 DTOs/enums so the frontend does not create a parallel API contract.

**Alternatives considered**: Creating frontend-owned duplicate contract types or changing backend contracts. Both are rejected because they increase drift risk and violate the instruction to preserve Spec 004 backend behavior.
