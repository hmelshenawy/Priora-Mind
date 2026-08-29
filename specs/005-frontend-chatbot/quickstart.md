# Quickstart: Frontend Chatbot

## Prerequisites

- Node.js 20 or newer.
- Workspace dependencies installed with `npm install` from the repository root.
- Existing backend Conversation API from Spec 004 available or mocked in frontend tests.

## Development

1. Start the frontend:

   ```powershell
   npm -w 03-FRONTEND run dev
   ```

2. Open the protected dashboard/coaching plan flow and use the chatbot entry point.

3. Verify the MVP flows manually against the existing Conversation API or test stubs:

   - Open chat from the current therapy/coaching plan.
   - Return to the plan without losing context.
   - Create a conversation.
   - Open and recover an existing conversation after refresh or direct navigation to its URL-addressable chat route.
   - Send a message with a new idempotency key.
   - Retry a failed send with another new idempotency key.
   - Render completed, clarification, insufficient-evidence, safety, and technical failure states.
   - Render citations when sources are present.
   - Archive and delete conversations.
   - Check desktop, mobile-sized, English, and Arabic/RTL layouts.

## Verification Commands

Backend architecture changes must also pass:

```powershell
npm -w 02-BACKEND run check:boundaries
```

Run from the repository root:

```powershell
npm -w 03-FRONTEND run test
npm -w 03-FRONTEND run lint
npm -w 03-FRONTEND run build
```

Focused frontend coverage should also verify, using only the existing frontend test stack:

- Composer validation.
- Idempotency-key generation.
- Retry with a new idempotency key.
- Backend response-state mapping.
- Citation rendering and fallback metadata.

Optional full workspace checks:

```powershell
npm run lint
npm run build
```

## Scope Guardrails

- Do not add backend endpoints.
- Do not modify Spec 004 backend assumptions.
- Do not call Python RAG, Qdrant, or LLM providers from the frontend.
- Do not add streaming, agents/tools, summarization, title editing, or a retry endpoint.
- Do not add local conversation persistence beyond existing application architecture.
- Do not create duplicate frontend-owned API contract types; reuse Spec 004 DTOs/enums from `@priora/shared-types` and modify shared exports only when required existing types are not exported.
