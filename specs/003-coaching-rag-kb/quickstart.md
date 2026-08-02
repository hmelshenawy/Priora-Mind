# Quickstart: Coaching RAG MVP

This quickstart describes validation after implementation. It is planning-only and does not add implementation code.

## Prerequisites

- One approved CBT source fixture is available as PDF or Markdown.
- Local Qdrant is available for integration tests.
- Fake embedding provider is configured for automated tests.
- Fake LLM provider is configured for Feature 002 e2e tests.
- RAG service credentials are configured through environment variables.

## Validation Steps

1. Run RAG unit, contract, and available integration tests:

   ```sh
   cd 04-RAG
   python -m pytest -q -rs
   python -m compileall -q src
   ```

2. Run backend RAG boundary/unit validation:

   ```sh
   cd 02-BACKEND
   npm test -- tests/contract/coaching-rag-boundary.contract.spec.ts tests/unit/coaching-plan-validator.spec.ts tests/unit/coaching-grounding.spec.ts
   ```

3. Run backend e2e validation for RAG integration and Feature 002 regressions:

   ```sh
   cd 02-BACKEND
   npm run test:e2e -- tests/e2e/coaching-rag-plan.e2e-spec.ts tests/e2e/coaching-plan.spec.ts tests/e2e/account-deletion.spec.ts tests/e2e/retention-cleanup.spec.ts
   ```

4. Run backend build/type validation:

   ```sh
   cd 02-BACKEND
   npm run build
   ```

5. If `qdrant-client` and local Qdrant are available, confirm the local Qdrant integration test is not skipped and verifies idempotent upsert plus payload metadata.

## Expected Results

- One approved CBT source is searchable only when approved and active.
- Source and chunk metadata live in Qdrant payloads.
- Retrieval returns bounded cited chunks and never returns the full source or full coaching library.
- Feature 002 fails closed when RAG is unavailable or grounding is insufficient.
- Frontend has no RAG/Qdrant access and NestJS has no Qdrant access.
- Future Enhancements remain deferred and are not needed to pass MVP validation.
