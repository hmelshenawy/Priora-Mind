# Implementation Plan: Frontend Chatbot

**Branch**: `005-frontend-chatbot` | **Date**: 2026-08-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-frontend-chatbot/spec.md`

## Summary

Build the frontend chatbot MVP as a protected post-onboarding experience integrated with the existing therapy/coaching plan flow. The implementation will add chat navigation, conversation list/detail views, message composer, citation display, archive/delete controls, retry using new idempotency keys, URL-based conversation recovery from backend state, responsive layout, Arabic/English support, and tests. The frontend will consume only the existing Spec 004 Conversation API through the approved frontend API layer and will not add backend APIs, direct RAG/Qdrant/LLM calls, streaming, agents/tools, summaries, or title editing.

## Technical Context

**Language/Version**: TypeScript 5.9, React 19, Next.js 16 App Router, Node.js >=20

**Primary Dependencies**: Next.js, React, next-intl, TanStack Query, Tailwind CSS, Playwright, shared DTO package `@priora/shared-types`

**Storage**: No new frontend persistence. Conversation recovery uses a URL-addressable selected conversation, preferably `/[locale]/chat/[conversationId]`, and existing backend conversation state through server-state queries. Access tokens remain in existing in-memory auth handling; refresh uses the existing HttpOnly cookie flow.

**Testing**: Existing frontend test stack only. Use Playwright frontend tests via `npm -w 03-FRONTEND run test` for E2E and focused component/unit-style coverage where supported by the current Playwright setup; lint via `npm -w 03-FRONTEND run lint`; production build via `npm -w 03-FRONTEND run build`; TypeScript checked by Next.js build. Do not introduce a new testing framework.

**Target Platform**: Web application running in the existing `03-FRONTEND` Next.js app.

**Project Type**: Frontend web application within a TypeScript npm workspace.

**Performance Goals**: Chat route loads and updates through existing query caching without page-level blocking beyond explicit loading states. Desktop and mobile layouts must remain usable for list, active conversation, citations, and composer.

**Constraints**: Frontend-only MVP; no new backend APIs; no direct Python RAG, Qdrant, or LLM provider calls; no streaming; no agents/tools; no summarization; no conversation title editing; no retry endpoint; no extra local persistence; preserve Spec 004 backend behavior.

**Scale/Scope**: One protected chat experience integrated with the current dashboard/coaching plan flow, covering conversation list, active conversation URL recovery, send, retry, citations, archive/delete, responsive layout, E2E coverage, and focused existing-stack tests for composer validation, idempotency-key generation, retry key renewal, backend response-state mapping, and citation fallback rendering.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Coaching, Not Clinical Care**: PASS. Frontend renders backend-provided content and preserves product boundary copy; it does not generate clinical, therapeutic, diagnostic, medication, or emergency-care content.
- **II. Safety Before Coaching**: PASS. Safety routing remains backend-owned by Spec 004. Frontend represents safety/failure states and does not bypass backend safety outcomes.
- **III. Evidence-Grounded and Bounded AI**: PASS. Frontend displays backend-provided citations and insufficient-evidence states; it does not call RAG, Qdrant, or LLM providers.
- **IV. Domain Ownership and Human-Controlled AI**: PASS. Conversation state, eligibility, routing, assistant generation, and persistence remain backend-owned. Frontend handles navigation and presentation only.
- **V. Structured Coaching Experience**: PASS. Chat entry/return is integrated with the existing coaching plan flow and does not create an unrestricted engagement loop or new AI behavior.
- **VI. Privacy, Data Isolation, and User Control**: PASS. Frontend route guards improve UX only; authorization remains backend-owned. No local conversation persistence is added. Delete/archive controls use existing backend ownership checks.
- **VII. Explicit and Limited Context and Memory**: PASS. Conversation recovery uses URL-addressable conversation identity plus existing backend state and does not add summaries, long-term memory, or local caches beyond existing query/server-state patterns.
- **VIII. Clean, Modular, and Maintainable Code**: PASS. Plan uses existing feature/API/query patterns, avoids unnecessary abstractions, and keeps files under the 300-line limit.
- **IX. Testing and Verifiable Behavior**: PASS. Plan requires Playwright coverage for critical chat journeys, response states, retry, citations, responsive layout, RTL, and API-boundary constraints.
- **X. Arabic and English Quality Equality**: PASS. Chat content, states, navigation labels, citations, and responsive layout must work in LTR and RTL.
- **XI. Authoritative Project References**: PASS. Reference alignment is documented below.
- **XII. Simplicity and MVP Discipline**: PASS. Scope is limited to the requested MVP and existing backend contract.

No gate violations. No complexity exceptions required.

## Reference Alignment

- **PRD.md**: Aligns with AI chat, personalized coaching journey, evidence-based support, responsive UI, conversation deletion, privacy, and safety boundaries. PRD references streaming and summaries as broader product goals, but this MVP follows the approved Spec 005 constraint that streaming and summarization are deferred.
- **SAD.md**: Aligns with the frontend-to-backend boundary, authenticated protected routes, provider-independent AI ownership in backend services, RAG isolation, and the rule that frontend clients never call RAG, Qdrant, or LLM providers directly.
- **Frontend_Architecture.md**: Aligns with feature-first frontend structure, protected post-onboarding dashboard/chat routes, service-layer API access, TanStack Query for server state, minimal local UI state, loading/error/empty states, Arabic/English and RTL support, and reusable chat UI. The architecture mentions streaming chat; this plan resolves the conflict by implementing non-streaming synchronous behavior only for Spec 005.
- **Conflicts / Gaps**: No authoritative document update is required before implementation. Streaming and summaries remain future enhancements. Spec 004 remains unchanged and is consumed as the backend source of truth.

## Project Structure

### Documentation (this feature)

```text
specs/005-frontend-chatbot/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── chatbot-ui-contract.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
03-FRONTEND/
├── src/
│   ├── app/[locale]/(protected)/chat/
│   │   ├── page.tsx
│   │   └── [conversationId]/page.tsx
│   ├── features/chat/
│   │   ├── chat.api.ts
│   │   ├── chat-hooks.ts
│   │   ├── chat-page-view.tsx
│   │   ├── conversation-list.tsx
│   │   ├── conversation-thread.tsx
│   │   ├── message-composer.tsx
│   │   └── citation-list.tsx
│   ├── features/coaching/
│   │   └── coaching-plan-view.tsx
│   ├── i18n/messages/
│   │   ├── en.json
│   │   └── ar.json
│   └── services/api.ts
└── tests/e2e/
    └── chatbot.spec.ts

shared/
└── src/index.ts
```

**Structure Decision**: Use the existing `03-FRONTEND/src/features/*` feature-first pattern. Add a focused `features/chat` area plus protected localized chat routes for the list/new state and selected conversation recovery. Prefer `/[locale]/chat/[conversationId]` for direct recovery after refresh, revisit, or plan re-entry unless an existing repository-approved URL state pattern is identified during implementation. Reuse the existing `ApiService`, `apiFetch`, `next-intl`, TanStack Query provider, protected layout, Playwright setup, and Spec 004 DTOs/enums from `@priora/shared-types`. Modify shared exports only if required existing Spec 004 types are present but not exported; do not create duplicate frontend-owned API contract types and do not change backend contracts.

## Complexity Tracking

No constitution violations or justified complexity exceptions.

## Phase 0: Research

See [research.md](./research.md). All technical context items are resolved; no `NEEDS CLARIFICATION` remains.

## Phase 1: Design and Contracts

See [data-model.md](./data-model.md), [contracts/chatbot-ui-contract.md](./contracts/chatbot-ui-contract.md), and [quickstart.md](./quickstart.md).

## Post-Design Constitution Check

PASS. The design remains frontend-only, consumes the existing Conversation API, preserves safety/coaching boundaries, avoids new backend/API/provider behavior, adds no extra local persistence, and defines testable acceptance criteria aligned with the constitution.
