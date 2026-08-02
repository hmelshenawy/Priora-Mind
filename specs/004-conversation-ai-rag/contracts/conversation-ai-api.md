# Contract: Conversation AI Backend API and RAG Boundary

This contract is internal to the backend implementation and public to the future Spec 005 frontend through `/api/v1`. The frontend calls only the backend. The backend calls only the authenticated Python RAG API. The frontend never calls RAG or Qdrant.

## Common Backend API Rules

- Base path: `/api/v1`.
- Protected endpoints require the existing authenticated, email-verified user context, completed onboarding, and not `SAFETY_HOLD` for normal conversation access.
- Ownership is resolved from the authenticated user; request bodies must not include `userId`.
- Requests and responses are JSON.
- Errors use the existing `{ "error": { "code": "..." } }` convention with safe, stable codes.
- `X-Idempotency-Key` is required for send-message. Create-conversation idempotency is deferred from the MVP.
- `X-Correlation-Id` is accepted and propagated when supplied; otherwise the backend creates one.

## Data Transfer Objects

### ConversationSummary

```json
{
  "id": "uuid",
  "title": "Stress tools",
  "status": "ACTIVE",
  "createdAt": "2026-08-02T12:00:00.000Z",
  "updatedAt": "2026-08-02T12:05:00.000Z",
  "lastMessageAt": "2026-08-02T12:05:00.000Z"
}
```

### ConversationMessage

```json
{
  "id": "uuid",
  "conversationId": "uuid",
  "role": "assistant",
  "content": "A short grounded answer...",
  "status": "COMPLETED",
  "route": "RAG",
  "sources": [],
  "createdAt": "2026-08-02T12:05:00.000Z",
  "completedAt": "2026-08-02T12:05:02.000Z"
}
```

### AssistantSource

```json
{
  "chunkId": "chunk_abc",
  "sourceId": "cbt-coaching-v1",
  "sourceTitle": "Approved CBT Coaching Source",
  "sourceFile": "approved-cbt.pdf",
  "sourceType": "pdf",
  "chunkIndex": 12,
  "score": 0.84,
  "citationPage": 4,
  "pageStart": 4,
  "pageEnd": 5,
  "citationHeading": "Grounding skills",
  "citationSection": "paced-breathing",
  "textHash": "sha256:...",
  "displayOrder": 1
}
```

Missing page metadata is represented as `null` or omitted. The frontend must be able to display title/file/heading/section/chunk fallback text.

## POST /api/v1/conversations

Creates one owned conversation.

### Request

```json
{
  "title": "Stress tools"
}
```

Validation:

- `title` optional.
- If present, trimmed title must be within the configured title length limit.
- Request must not include `userId`.

### Success: 201

```json
{
  "conversation": {
    "id": "uuid",
    "title": "Stress tools",
    "status": "ACTIVE",
    "createdAt": "2026-08-02T12:00:00.000Z",
    "updatedAt": "2026-08-02T12:00:00.000Z",
    "lastMessageAt": null
  }
}
```

### Errors

- `401 UNAUTHORIZED`
- `403 EMAIL_NOT_VERIFIED`
- `403 ONBOARDING_REQUIRED`
- `409 SAFETY_HOLD`
- `400 VALIDATION_ERROR`

## GET /api/v1/conversations

Lists the authenticated user's conversations.

### Query Parameters

- `cursor` optional.
- `limit` optional; bounded by server maximum.
- `includeArchived` optional boolean; default `false`.

### Success: 200

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "Stress tools",
      "status": "ACTIVE",
      "createdAt": "2026-08-02T12:00:00.000Z",
      "updatedAt": "2026-08-02T12:05:00.000Z",
      "lastMessageAt": "2026-08-02T12:05:00.000Z"
    }
  ],
  "nextCursor": null
}
```

Ordering: most recently updated first, with a stable tie-breaker.

## GET /api/v1/conversations/:conversationId

Retrieves one owned conversation and paginated messages.

### Query Parameters

- `messagesCursor` optional.
- `messagesLimit` optional; bounded by server maximum.

### Success: 200

```json
{
  "conversation": {
    "id": "uuid",
    "title": "Stress tools",
    "status": "ACTIVE",
    "createdAt": "2026-08-02T12:00:00.000Z",
    "updatedAt": "2026-08-02T12:05:00.000Z",
    "lastMessageAt": "2026-08-02T12:05:00.000Z"
  },
  "messages": [
    {
      "id": "uuid",
      "conversationId": "uuid",
      "role": "user",
      "content": "What is grounding?",
      "status": "COMPLETED",
      "route": null,
      "sources": [],
      "createdAt": "2026-08-02T12:04:59.000Z",
      "completedAt": "2026-08-02T12:04:59.000Z"
    }
  ],
  "nextMessagesCursor": null
}
```

Errors:

- `404 CONVERSATION_NOT_FOUND` for missing or foreign conversation.

## PATCH /api/v1/conversations/:conversationId

Updates owner-controlled lifecycle state.

### Request

```json
{
  "archived": true
}
```

Validation:

- At least one supported field is required.
- `archived = true` archives; `archived = false` unarchives.
- Unknown lifecycle transitions are rejected.

### Success: 200

Returns the archived or unarchived `ConversationSummary`.

## DELETE /api/v1/conversations/:conversationId

Hard-deletes the owned conversation according to established cascade/retention behavior.

### Success: 204

No body.

Errors:

- `404 CONVERSATION_NOT_FOUND` for missing or foreign conversation.

## POST /api/v1/conversations/:conversationId/messages

Sends one user message and returns persisted user and assistant messages.

### Headers

- `X-Idempotency-Key`: required stable client-generated key for this send.
- `X-Correlation-Id`: optional.

### Request

```json
{
  "content": "What is a grounding exercise?"
}
```

Validation:

- `content` required, trimmed non-empty.
- Content length bounded by server maximum.
- Request body must not include route, status, sources, provider, prompt, or user id.

### Success: 200 or 201

```json
{
  "conversationId": "uuid",
  "userMessage": {
    "id": "uuid",
    "conversationId": "uuid",
    "role": "user",
    "content": "What is a grounding exercise?",
    "status": "COMPLETED",
    "route": null,
    "sources": [],
    "createdAt": "2026-08-02T12:00:00.000Z",
    "completedAt": "2026-08-02T12:00:00.000Z"
  },
  "assistantMessage": {
    "id": "uuid",
    "conversationId": "uuid",
    "role": "assistant",
    "content": "...",
    "status": "COMPLETED",
    "route": "RAG",
    "sources": [
      {
        "chunkId": "chunk_abc",
        "sourceId": "cbt-coaching-v1",
        "sourceTitle": "Approved CBT Coaching Source",
        "sourceFile": "approved-cbt.pdf",
        "sourceType": "pdf",
        "chunkIndex": 12,
        "score": 0.84,
        "citationPage": 4,
        "pageStart": 4,
        "pageEnd": 5,
        "citationHeading": "Grounding skills",
        "citationSection": "paced-breathing",
        "textHash": "sha256:...",
        "displayOrder": 1
      }
    ],
    "createdAt": "2026-08-02T12:00:02.000Z",
    "completedAt": "2026-08-02T12:00:02.000Z"
  }
}
```

### Stable Outcomes

- `STATIC_RESPONSE`: returns completed assistant message with empty sources.
- `SYSTEM_COMMAND`: returns completed assistant message with empty sources.
- `SAFETY`: returns deterministic assistant message with `status = COMPLETED`; no RAG or LLM call. The safety outcome is stored in the relevant metadata/evaluation record.
- Safety Check technical failure: returns the fixed safety technical-failure fallback with `status = FAILED`, route/stage `SAFETY`, and sanitized failure metadata; no command, greeting, follow-up rewrite, RAG, or normal LLM processing continues.
- `RAG` with sufficient evidence: returns grounded answer with sources.
- `RAG` with empty or weak retrieval: returns safe insufficient-evidence assistant message with `status = COMPLETED`, empty sources, and no unsupported claims.
- `RAG` timeout, unavailable service, or malformed response: returns safe technical failure assistant message with `status = FAILED` and persisted sanitized failure metadata.
- LLM failure after sufficient retrieval: returns documented safe technical failure response and persisted `FAILED` state.

### Errors

- `400 VALIDATION_ERROR`
- `401 UNAUTHORIZED`
- `403 EMAIL_NOT_VERIFIED`
- `403 ONBOARDING_REQUIRED`
- `404 CONVERSATION_NOT_FOUND`
- `409 CONVERSATION_ARCHIVED`
- `409 SAFETY_HOLD`
- `409 IDEMPOTENCY_CONFLICT`

Idempotency rule: reusing the same idempotency key returns the original stored result, including a stored failure. Retrying failed processing in the MVP requires a new idempotency key. A dedicated retry endpoint is out of scope.

## Backend-to-RAG Boundary

### Current Implemented Python Contract

`GET /v1/health`

Headers:

```text
Authorization: Bearer <RAG_SERVICE_TOKEN>
```

Success:

```json
{
  "status": "ok",
  "collection_name": "priora_rag_local",
  "embedding_model": "BAAI/bge-m3",
  "embedding_dimension": 1024,
  "qdrant": "ok"
}
```

`POST /v1/search`

Headers:

```text
Authorization: Bearer <RAG_SERVICE_TOKEN>
```

Request:

```json
{
  "question": "standalone retrieval query",
  "limit": 6,
  "score_threshold": 0.7
}
```

Response:

```json
{
  "results": [
    {
      "chunk_id": "chunk_abc",
      "score": 0.84,
      "text": "Short selected chunk text...",
      "source_id": "cbt-coaching-v1",
      "source_title": "Approved CBT Coaching Source",
      "source_file": "approved-cbt.pdf",
      "source_type": "pdf",
      "chunk_index": 12,
      "page_number": 4,
      "page_start": 4,
      "page_end": 5,
      "citation_page": 4,
      "citation_heading": "Grounding skills",
      "citation_section": "paced-breathing",
      "text_hash": "sha256:..."
    }
  ]
}
```

### Backend Normalization

The backend conversation RAG client normalizes Python outcomes into:

```json
{
  "status": "ok",
  "correlationId": "corr_123",
  "chunks": []
}
```

Allowed normalized statuses: `ok`, `insufficient_grounding`, `unavailable`, `invalid_response`, `timeout`.

The backend owns sufficiency. It may treat an `ok` result with no chunks or weak scores as `insufficient_grounding`, which maps to a `COMPLETED` insufficient-evidence assistant message. `unavailable`, `invalid_response`, and `timeout` map to a `FAILED` safe technical assistant message.

## LLM Provider Boundary

The conversation service consumes a provider-neutral operation equivalent to:

```text
generateGroundedAnswer(request) -> result
```

Request data:

- Correlation id.
- Provider/model configuration reference.
- Product/system instructions.
- Bounded recent history.
- Current user message.
- Standalone retrieval query.
- Retrieved chunks selected for this answer.
- Required output/citation expectations.

Result data:

- Answer content.
- Citation references to supplied chunk ids.
- Safe usage/latency metadata where available.

Normalized provider errors:

- `LLM_DISABLED`
- `LLM_UNAVAILABLE`
- `LLM_TIMEOUT`
- `LLM_RATE_LIMITED`
- `LLM_INVALID_OUTPUT`
- `LLM_UNSAFE_OUTPUT`
- `LLM_UNSUPPORTED_CITATION`

Provider-specific request/response code must not live inside conversation lifecycle services.

## Follow-Up Rewrite Boundary

Clear standalone messages use the original user text as the retrieval query. Only ambiguous follow-ups use the configured LLM provider to produce a standalone retrieval query from bounded recent history.

Follow-up detection is deterministic backend logic, not an LLM classifier. Rules may match very short dependent questions such as "why?", "how?", or "then what?", pronouns or references without a clear subject, explicit references to previous discussion, or messages that do not contain enough standalone meaning for retrieval. Greetings and backend commands are handled before follow-up detection.

If rewrite succeeds, the original message remains unchanged and the rewritten query is stored as processing metadata, then processing continues to RAG. If context is insufficient, the backend returns a clarification question with `status = COMPLETED`, records route `RAG` and reason `INSUFFICIENT_CONTEXT`, and does not call RAG. If rewrite fails technically because of timeout, provider failure, or malformed output, the backend returns the safe technical fallback with `status = FAILED`, records route `RAG` and processing stage `FOLLOW_UP_REWRITE`, and does not call RAG.

The LLM rewrite provider must not decide the main route or classify the message as `SAFETY`, `SYSTEM_COMMAND`, `STATIC_RESPONSE`, or `RAG`.

## Fixed Fallbacks

Safety Check technical-failure fallback:

```text
I'm having trouble completing the safety check right now, so I can't continue with coaching. If you are in immediate danger or may harm yourself, contact local emergency services now or reach out to a trusted nearby person for immediate help.
```

Non-safety technical fallback:

```text
I'm having trouble processing that right now. Please try again in a moment.
```
