# Data Model: Coaching RAG MVP

MVP metadata is stored in Qdrant payloads. No separate document-registry database is required for the first implementation.

## SourceMetadata

Represents the one approved CBT coaching source.

Fields:

- `source_id`: stable source id.
- `source_title`: human-readable source title.
- `source_type`: `pdf` or `markdown`.
- `source_checksum`: checksum of the approved source file.
- `language`: `ar`, `en`, or `mixed`.
- `approved`: boolean; must be `true` for searchable content.
- `active`: boolean; must be `true` for searchable content.
- `citation_base`: optional source-level citation label or document reference.

Validation rules:

- Source must be explicitly approved and active before retrieval can return its chunks.
- Source type must be PDF or Markdown.
- Checksum is required for deterministic chunking and repeat ingestion checks.

## ChunkMetadata

Stored as Qdrant payload metadata attached to each vector.

Fields:

- `chunk_id`: deterministic chunk id.
- `source_id`: source id.
- `source_title`: source title.
- `source_type`: `pdf` or `markdown`.
- `source_checksum`: source checksum.
- `language`: `ar`, `en`, or `mixed`.
- `chunk_order`: numeric chunk order within normalized source text.
- `text_hash`: hash of normalized chunk text.
- `text`: normalized chunk text used for generation context.
- `citation_page`: page number when available.
- `citation_heading`: heading when available.
- `citation_section`: section anchor when available.
- `approved`: boolean.
- `active`: boolean.
- `embedding_model`: configured embedding model id.
- `embedding_dimension`: configured vector dimension.
- `environment`: environment label, such as local/test/staging/production.

Validation rules:

- Retrieval filters require `approved = true` and `active = true`.
- `embedding_model` and `embedding_dimension` must match service configuration before indexing and retrieval.
- At least one stable citation location should be present when available: page, heading, or section anchor.
- Line numbers are not required.

## RetrievalRequest

Structured request from NestJS to RAG.

Fields:

- `correlation_id`: request correlation id.
- `generation_attempt_id`: Feature 002 generation attempt id or equivalent correlation value.
- `assessment_result_id`: assessment result id for traceability, not raw answers.
- `assessment_definition_version`: assessment definition version.
- `focus_areas`: ordered assessment-derived focus areas.
- `support_domain`: support domain from assessment result.
- `strongest_domain`: strongest domain from assessment result.
- `priority_codes`: selected priority codes, not free text.
- `language`: requested language context, `ar`, `en`, or `mixed`.
- `safety_exclusions`: ordinary coaching exclusions such as crisis/high-risk/medical/medication content.
- `top_k`: maximum chunks to return.
- `score_threshold`: minimum score.
- `max_context_chars`: context budget.

Validation rules:

- Must not include raw assessment answers, free text, safety answers, hidden chain-of-thought, or unnecessary personal data.
- `top_k`, `score_threshold`, and `max_context_chars` must be bounded by server configuration.

## RetrievalResult

Response from RAG to NestJS.

Fields:

- `correlation_id`: request correlation id.
- `status`: `ok`, `insufficient_grounding`, or `unavailable`.
- `collection_name`: Qdrant collection used.
- `embedding_model`: embedding model used.
- `embedding_dimension`: embedding dimension used.
- `chunks`: ordered list of returned chunks.
- `budget`: returned chunk count and character count.
- `error_code`: safe error code when status is not `ok`.

Chunk result fields:

- `chunk_id`
- `text`
- `score`
- `source_id`
- `source_title`
- `source_type`
- `citation_page`
- `citation_heading`
- `citation_section`
- `text_hash`

Validation rules:

- Returned chunks must already satisfy approved/active filters, score threshold, deduplication, and context budget.
- `insufficient_grounding` causes Feature 002 to fail closed.

## RagContextForGeneration

Bounded context passed from NestJS into the existing Feature 002 generation path.

Fields:

- `retrieval_status`: copied from `RetrievalResult.status`.
- `chunks`: returned chunk texts and citation metadata.
- `allowed_chunk_ids`: chunk ids that generated citations may reference.
- `correlation_id`: trace id.

Validation rules:

- If status is not `ok`, Feature 002 must fail closed.
- Generated citations must reference only `allowed_chunk_ids` from the current attempt.
