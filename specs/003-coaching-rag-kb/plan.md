# Implementation Plan: Coaching RAG MVP

**Branch**: `003-coaching-rag-kb` | **Date**: 2026-08-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-coaching-rag-kb/spec.md`

## Summary

Feature 003 MVP adds the smallest safe RAG loop for Feature 002 coaching-plan generation. A standalone Python/FastAPI service under `04-RAG/` ingests one explicitly approved CBT coaching source from PDF or Markdown, extracts Arabic/English text, normalizes and chunks deterministically, embeds chunks through one configurable embedding-provider port, and stores vectors plus source/chunk metadata in one environment-specific Qdrant collection behind a vector-store port.

NestJS remains the owner of Feature 002 coaching generation. It builds a structured assessment-dimension retrieval request, calls only the authenticated RAG API, receives bounded cited chunks, validates citations against the returned context for the current generation attempt, and fails closed through existing Feature 002 behavior when RAG is unavailable or insufficient. The frontend never calls RAG or Qdrant. Ingestion is internal operator-only via command or protected endpoint and is never exposed to the frontend.

Future Enhancements from `spec.md` are intentionally deferred and are not MVP dependencies.

## Technical Context

**Language/Version**: Python 3.x with FastAPI for `04-RAG/`; existing TypeScript/NestJS backend integrates through HTTP only.

**Primary Dependencies**: FastAPI, PDF text extraction library selected during implementation, Markdown parser, configured embedding provider behind an internal port, Qdrant client behind a vector-store port, test fakes for embedding and vector store.

**Storage**: Qdrant only for MVP source/chunk metadata and vectors. No separate document-registry database. Metadata is stored in Qdrant payloads.

**Testing**: Fake-provider unit tests, RAG API contract tests, local Qdrant integration tests, and one Assessment-to-Retrieval-to-Plan e2e test with fake LLM and fake embedding providers.

**Target Platform**: Internal service reachable by NestJS in local/test/staging/production environments. Frontend has no route to RAG or Qdrant.

**Performance Goals**: Retrieval returns bounded context or a stable fail-closed error within the existing Feature 002 generation timeout. Ingestion is operator-triggered and not user-facing.

**Constraints**:

- One approved CBT source in MVP.
- PDF and Markdown ingestion only.
- One environment-specific Qdrant collection.
- One configured embedding provider at a time.
- Approved/active-only retrieval.
- No raw assessment answers, free text, safety answers, hidden chain-of-thought, or unnecessary personal data in retrieval requests.
- No full source or full coaching library in generation prompts.
- No Future Enhancements as MVP dependencies.

## Constitution Check

| # | Principle | Status | MVP Alignment |
|---|-----------|--------|---------------|
| I | Coaching, Not Clinical Care | Pass | Uses approved CBT coaching content only; no diagnosis, medication, or clinical positioning. |
| II | Safety Before Coaching | Pass | Retrieval includes safety exclusions and Feature 002 remains fail-closed on unavailable or insufficient grounding. |
| III | Evidence-Grounded and Bounded AI | Pass | Generation receives bounded cited chunks, not full-source prompt stuffing. |
| IV | Domain Ownership and Human-Controlled AI | Pass | NestJS/Feature 002 owns generation and validation; RAG only returns context. |
| V | Structured Coaching Experience | Pass | Existing Feature 002 plan lifecycle remains authoritative. |
| VI | Privacy, Data Isolation, User Control | Pass | Retrieval uses assessment dimensions only and excludes raw answers/free text/safety answers. |
| VII | Explicit and Limited Context and Memory | Pass | RAG context is explicit, bounded, and per generation attempt; no memory added. |
| VIII | Clean, Modular, Maintainable Code | Pass | RAG service owns Qdrant; NestJS calls API only; provider ports keep dependencies isolated. |
| IX | Testing and Verifiable Behavior | Pass | Fake-provider, contract, local Qdrant, and one full e2e test are required. |
| X | Arabic and English Quality Equality | Pass | Extraction, normalization, chunking, and retrieval preserve Arabic/English text and citations. |
| XI | Authoritative Project References | Pass | Plan follows revised `spec.md` as the authoritative MVP scope. |
| XII | Simplicity and MVP Discipline | Pass | Defers snapshots, rollback, multi-version lifecycle, migrations, and evaluation platforms. |

## MVP Architecture

```text
Operator command/protected endpoint
        │
        ▼
04-RAG FastAPI service
  ├── ingestion pipeline: PDF/Markdown -> text -> normalized text -> chunks
  ├── embedding port: configured provider or fake provider
  ├── vector-store port: Qdrant adapter or fake adapter
  └── retrieval API: active-only, top-k, threshold, dedupe, budget, citations
        │
        ▼
Qdrant environment collection
        ▲
        │ authenticated HTTP only
02-BACKEND NestJS Feature 002
  ├── builds assessment-dimension query
  ├── calls RAG API
  ├── validates returned citations against generated output
  └── uses existing fail-closed generation lifecycle
        ▲
        │ existing backend API only
03-FRONTEND dashboard
```

## Data and Metadata Strategy

- Source metadata is stored as Qdrant payload fields on each chunk vector.
- Chunk metadata is stored as Qdrant payload fields on each chunk vector.
- No separate RAG metadata database is required for MVP.
- The approval/active marker is a payload field used by retrieval filters.
- Citation location metadata is page, heading, or section anchor when available; unstable PDF or Markdown line numbers are not required.

## API Strategy

- Internal ingestion command or protected endpoint for the one approved source.
- Authenticated retrieval endpoint consumed by NestJS.
- Health endpoint for service and Qdrant readiness.
- Stable fail-closed errors for unavailable dependencies, insufficient grounding, invalid input, or dimension mismatch.

## Security Strategy

- Service authentication for NestJS-to-RAG calls.
- Ingestion is operator-only and never frontend-accessible.
- File validation checks type, size, readable content, and unsafe path/name behavior before indexing.
- Secrets live in environment/configuration and are never logged.
- Logs are redacted and include correlation id, operation, counts, timing, and safe error codes only.

## Deferred Future Enhancements

The following remain explicitly out of MVP scope: immutable multi-version lifecycle, snapshots, rollback, `SUPERSEDED`/`REVOKED` automation, resumable background ingestion, collection migration orchestration, stale-vector cleanup automation, automated backup/recovery, full Recall@K/Precision@K evaluation platform, independent plan/goal/action citation persistence, complex governance workflows, and exhaustive new retry/retake/late-result/concurrency orchestration.

## Project Structure

```text
specs/003-coaching-rag-kb/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── rag-service.md
└── tasks.md          # intentionally not updated by this planning turn

04-RAG/              # planned standalone Python/FastAPI RAG service
02-BACKEND/          # planned NestJS RAG API client only; no Qdrant access
03-FRONTEND/         # no RAG or Qdrant access
```

## Post-Design Constitution Check

No gate failures. The MVP keeps RAG bounded, approved-source-only, provider-independent, privacy-preserving, testable, and intentionally smaller than the long-term production architecture.
