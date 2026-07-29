<!--
Sync Impact Report
- Version change: (uninitialized template) → 1.0.0
- Initial ratification: all template placeholders resolved with concrete Priora Mind values.
- Principles filled (new — first adoption):
  - I. Safety Before Coaching (NON-NEGOTIABLE)
  - II. AI Assists, Never Diagnoses
  - III. Evidence-Based & Grounded AI
  - IV. Domain Ownership & AI as a Service
  - V. Provider Independence
  - VI. Privacy First & User Data Ownership
  - VII. MVP Simplicity & YAGNI
- Sections filled (new — first adoption):
  - Authoritative Architecture and Product References (mandates PRD.md, SAD.md, Frontend_Architecture.md + Reference Alignment requirement)
  - Development Workflow & Quality Gates (frontend conventions, testing discipline, quality gates)
  - Governance (compliance, conflict resolution, doc sync, amendment procedure, versioning policy)
- Principles renamed: none (first adoption)
- Sections removed: none
- Templates requiring updates:
  - .specify/templates/spec-template.md — ✅ added "Reference Alignment" mandatory section
  - .specify/templates/plan-template.md — ✅ added "Reference Alignment" mandatory section
  - .specify/templates/tasks-template.md — ✅ no change needed (task categories already cover testing/contract/integration discipline; no new principle-driven task type required)
  - .specify/templates/checklist-template.md — ✅ no change needed (generic by design)
  - .specify/templates/constitution-template.md — ✅ no change needed (source template unchanged; concrete values live in .specify/memory/constitution.md)
- Deferred TODOs: none
-->

# Priora Mind Constitution

## Core Principles

### I. Coaching, Not Clinical Care (NON-NEGOTIABLE)

Priora Mind MUST operate as a personal growth and mental wellness coaching platform. It MUST NOT present itself as a medical, psychiatric, psychological, or emergency-care service.

- The system MUST NOT diagnose mental-health conditions.
- The system MUST NOT prescribe, recommend, change, or discontinue medication.
- The system MUST NOT claim to replace a qualified healthcare professional.
- Coaching responses MUST remain within the approved product scope defined in `PRD.md`.
- The limitations of the service MUST be communicated clearly during onboarding and wherever contextually necessary.
- If a request exceeds the approved coaching scope, the system MUST explain the limitation and direct the user toward appropriate professional support.
- Assessments MUST be presented as coaching or screening inputs, not medical diagnoses.

Rationale: Users may discuss sensitive personal experiences. The product must maintain a clear and responsible boundary between coaching and clinical care.

---

### II. Safety Before Coaching (NON-NEGOTIABLE)

User safety MUST take priority over engagement, personalization, response fluency, feature completion, and business objectives.

Every user message entering an AI coaching flow MUST pass through the approved safety pipeline:

1. Pre-generation risk assessment.
2. Risk-level classification.
3. Selection of the permitted response path.
4. AI generation only when permitted.
5. Post-generation safety validation.
6. Delivery, replacement, or blocking of the response.

The supported safety classifications MUST follow the definitions and behavior documented in the approved safety specification. At minimum, the architecture MUST distinguish between:

- `NORMAL`
- `DISTRESS`
- `HIGH_RISK`
- `CRISIS`

Required behavior:

- `NORMAL` MAY proceed through the standard coaching flow.
- `DISTRESS` MUST receive supportive, bounded, and context-appropriate coaching.
- `HIGH_RISK` MUST bypass unrestricted coaching behavior and follow the approved safety decision matrix.
- `CRISIS` MUST bypass normal AI coaching generation and use a deterministic, reviewed safety response.
- Crisis responses MUST NOT depend on unrestricted generative output.
- Crisis guidance MUST use location-appropriate resources when reliable location information is available.
- The system MUST NOT invent hotline numbers, emergency contacts, or professional resources.
- When reliable local information is unavailable, the response MUST direct the user toward local emergency services or a trusted person without fabricating details.
- Safety checks MUST fail closed. A safety-service failure MUST NOT silently permit normal coaching.
- Safety decisions and overrides MUST be auditable without storing unnecessary sensitive conversation content.
- Safety rules MUST be covered by automated tests.

Rationale: A supportive response is valuable only when it is safe. Safety processing is part of the core request lifecycle, not an optional enhancement.

---

### III. Evidence-Grounded and Bounded AI

Coaching advice, exercises, educational content, and generated plans MUST remain grounded in approved knowledge and product rules.

- Knowledge retrieval MUST use only curated, approved, and versioned sources defined by the current product and architecture specifications.
- Retrieved content MUST preserve source metadata sufficient for traceability.
- The system MUST define retrieval thresholds and fallback behavior.
- When evidence is insufficient, the system MUST acknowledge the limitation instead of inventing information.
- The AI MUST NOT fabricate sources, citations, exercises, assessment results, or clinical claims.
- Generated exercises MUST come from approved content or comply with explicitly approved generation rules.
- Relevant source references SHOULD be retained internally and displayed when required by the product specification.
- Knowledge ingestion and runtime retrieval MUST remain separate architectural concerns.
- Changes to the knowledge base MUST be versioned and independently reversible.
- AI prompts MUST explicitly enforce product scope, safety boundaries, structured-output requirements, and language requirements.
- Provider-specific behavior MUST remain behind application-owned interfaces.
- Replacing an AI or embedding provider MUST NOT require changing domain rules.

Rationale: Priora Mind must provide dependable guidance without presenting probabilistic model output as established fact.

---

### IV. Domain Ownership and Human-Controlled AI

The AI assists the product; it does not own business state or domain decisions.

- AI providers MUST NOT write directly to business entities or repositories.
- AI output MUST first be returned as a defined structured DTO.
- Structured output MUST be validated for schema, safety, ownership, and domain rules before persistence.
- Invalid, incomplete, or unsafe AI output MUST be rejected.
- The owning domain module MUST decide whether and how validated AI output becomes persistent business state.
- AI-generated coaching plans MUST be explicitly accepted by the user before activation.
- AI-generated modifications to an active plan MUST require validation and the level of user confirmation defined by the product specification.
- Domain rules MUST remain deterministic wherever practical.
- Core application behavior MUST NOT depend on parsing uncontrolled natural-language output.
- Controllers, transport handlers, UI components, and AI adapters MUST NOT contain domain business logic.

Rationale: Business state must remain valid and predictable even when an AI provider produces incorrect, incomplete, or inconsistent output.

---

### V. Structured Coaching Experience

Priora Mind MUST provide a structured coaching journey rather than an unrestricted general-purpose chatbot.

Every active coaching plan MUST have:

- An explicit purpose.
- Defined goals.
- A lifecycle status.
- A duration or review point.
- Trackable progress.
- Assigned or approved exercises.
- Clear activation and completion rules.

Every coaching session MUST have:

- A clear relationship to a user and, when applicable, an active plan.
- A defined lifecycle.
- A purpose or session focus.
- A clear beginning and completion condition.
- A bounded conversation context.
- A structured summary where required.
- An explicit rule governing whether multiple sessions may be active.

Every exercise MUST:

- Have a defined purpose.
- Be connected to an approved goal or coaching outcome.
- Define what completion means.
- Store only the user data necessary for the feature.
- Remain within the non-clinical product boundary.

The system MUST NOT create open-ended engagement loops whose primary purpose is to keep the user chatting.

Rationale: Structure makes progress measurable, limits unsafe open-ended behavior, and differentiates Priora Mind from a generic chatbot.

---

### VI. Privacy, Data Isolation, and User Control (NON-NEGOTIABLE)

Priora Mind MUST apply privacy-by-design and collect only the data necessary to deliver approved product behavior.

- Every user-owned record MUST be associated with a verified owner.
- Backend authorization MUST enforce user-data isolation on every protected operation.
- Frontend route guards MUST NOT be treated as a security boundary.
- Sensitive conversation content MUST NOT appear in application logs, analytics events, traces, or error reports.
- Secrets, credentials, access tokens, and personal data MUST NOT be committed to source control.
- Authentication credentials MUST use the storage and transport mechanism defined in `SAD.md`.
- Frontend implementations MUST NOT invent alternative token-storage strategies.
- Only the minimum context required for the current operation MAY be shared with an AI provider.
- Full conversation histories MUST NOT be sent to an AI provider when bounded summaries and recent context are sufficient.
- Long-term memory MUST be explicit, limited, explainable, and user-controlled.
- Data stored for personalization MUST have a documented purpose.
- Users MUST be able to delete supported conversations and their accounts.
- Account deletion MUST cover relational records, vector-store data, session summaries, memories, generated content, and other derived user data.
- Retention and deletion behavior MUST be documented and testable.
- Sensitive data MUST be encrypted in transit and protected at rest according to the architecture specification.
- AI-provider data retention and training policies MUST be reviewed and documented before production use.
- Cross-user data leakage MUST be treated as a critical security incident.
- Authorization and user-isolation behavior MUST have automated tests.

Rationale: Mental-wellness conversations may contain highly sensitive information. User trust requires enforceable technical controls, not privacy statements alone.

---

### VII. Explicit and Limited Context and Memory

Personalization MUST use intentional, bounded, and relevant context.

Permitted context MAY include:

- The user profile fields required for the current feature.
- The relevant assessment result.
- The active coaching plan.
- Active goals and assigned exercises.
- Approved user memories.
- A limited number of recent messages.
- Relevant structured session summaries.

The application MUST NOT automatically provide the complete user history to every AI request.

- Context construction MUST be owned by a dedicated application service.
- Every context category MUST have a documented purpose.
- Context size MUST remain bounded.
- Expired, deleted, or unauthorized data MUST NOT enter the AI context.
- Long-term memory MUST require the user control defined in the product specification.
- Generated summaries MUST be validated before being treated as persistent memory.
- Memory retrieval MUST respect the same authorization and deletion requirements as primary data.

Rationale: More context is not automatically better. Bounded context improves privacy, cost, performance, predictability, and output relevance.

---

### VIII. Clean, Modular, and Maintainable Code (NON-NEGOTIABLE)

Code MUST be clean, cohesive, well-organized, testable, understandable, and easy to modify safely.

- Spaghetti code is prohibited.
- God classes, god services, god components, and circular dependencies are prohibited.
- Each module, class, function, method, and UI component MUST have one clear responsibility.
- Business logic MUST remain outside controllers, route handlers, UI components, infrastructure adapters, database adapters, and provider-specific integrations.
- Domain and application code MUST depend on contracts and abstractions rather than concrete infrastructure implementations.
- Module boundaries defined in `SAD.md` MUST be respected.
- Shared code MUST NOT become an unstructured dumping ground.
- Duplication MUST be removed when a stable shared abstraction is clear.
- Speculative abstractions and premature generalization are prohibited.
- Names MUST communicate intent.
- Misleading abbreviations, unexplained magic values, and hidden side effects are prohibited.
- Functions and methods SHOULD remain small and focused.
- Public contracts and complex business rules MUST be documented where their intent is not evident from the code.
- Refactoring MUST preserve behavior through relevant automated tests.

#### File-size rule

Handwritten source files MUST NOT exceed 300 lines of code.

Exceptions MAY include:

- Generated code.
- Database migrations.
- Test fixtures or static datasets.
- Unavoidable framework configuration.
- Approved declarative schema files that cannot be divided safely.

Exceptions MUST be documented and MUST NOT be used to hide poor separation of responsibilities.

A file approaching 300 lines MUST be reviewed and split by responsibility before additional behavior is added. Dividing a large file into arbitrary fragments without improving cohesion does not satisfy this rule.

#### Required quality gates

Before a feature is considered complete, affected code MUST:

- Be formatted.
- Pass linting.
- Pass type checking where applicable.
- Build successfully.
- Pass the relevant automated tests.
- Respect the 300-line limit.
- Preserve documented architectural boundaries.
- Contain no known critical or high-severity safety or security defects.

Rationale: Priora Mind contains sensitive and evolving workflows. Clean boundaries and controlled file size reduce regression risk and keep the system maintainable.

---

### IX. Testing and Verifiable Behavior

Every implemented behavior MUST have automated testing appropriate to its risk and architectural layer.

Mandatory automated coverage includes:

- Safety classification and routing.
- Crisis-response bypass behavior.
- Authentication and authorization.
- User-data isolation.
- Domain rules and lifecycle transitions.
- AI structured-output validation.
- API contracts.
- Account and conversation deletion.
- Context and memory authorization.
- Critical frontend user journeys.
- RTL-sensitive behavior where layout or interaction may change.
- Error and fallback paths for external providers.

Additional requirements:

- Tests MUST verify observable behavior, not private implementation details.
- External AI, database, vector-store, and network dependencies SHOULD be replaceable with test doubles at the appropriate boundary.
- Bug fixes MUST include a regression test when technically practical.
- End-to-end tests MUST cover the highest-risk user journeys.
- Safety and security tests MUST NOT rely solely on snapshots.
- Flaky tests MUST be fixed or removed with a documented replacement; they MUST NOT be silently ignored.
- TDD is encouraged but is not universally mandatory.
- A feature MUST NOT be marked complete while required tests are failing.

Rationale: Testing provides the evidence that safety, privacy, and domain boundaries continue working as the system evolves.

---

### X. Arabic and English Quality Equality

Arabic and English MUST be treated as first-class product languages.

- The user-facing language MUST follow the user’s language preference or the behavior defined in `PRD.md`.
- Safety behavior MUST be equivalent across supported languages.
- Arabic responses MUST be natural and contextually appropriate, not merely literal translations.
- RTL layout MUST be designed and tested from the beginning.
- Directionality MUST be correct for mixed Arabic, English, numbers, dates, and technical content.
- Localization strings MUST NOT be scattered as hard-coded UI text.
- Validation messages, error states, empty states, streaming states, and safety experiences MUST support both languages.
- Accessibility MUST be maintained in both LTR and RTL modes.
- Knowledge retrieval MAY use approved sources in a different language, but generated user-facing content MUST preserve meaning and safety.

Rationale: Language support includes behavior, layout, accessibility, and safety—not translation alone.

---

### XI. Authoritative Project References

The following documents are mandatory, application-wide references:

- `PRD.md` — product scope, requirements, user journeys, and business rules.
- `SAD.md` — backend architecture, module boundaries, data flow, security, safety, persistence, and integrations.
- `Frontend_Architecture.md` — frontend structure, routes, state management, UI patterns, RTL, accessibility, and frontend conventions.

Before specifying, planning, implementing, reviewing, or refactoring any feature, the relevant work MUST be checked against all three documents.

Required behavior:

- Feature work MUST NOT contradict an authoritative reference.
- Missing information MUST NOT be silently invented.
- Conflicts and material ambiguity MUST be identified before implementation.
- A proposed resolution MUST be documented and approved through the project workflow.
- Every feature specification and implementation plan MUST include a `Reference Alignment` section covering all three authoritative documents.
- Approved changes affecting product behavior MUST update `PRD.md`.
- Approved changes affecting backend or system architecture MUST update `SAD.md`.
- Approved changes affecting frontend architecture MUST update `Frontend_Architecture.md`.
- Documentation and implementation MUST remain synchronized.
- The Constitution takes precedence when an authoritative reference conflicts with a non-negotiable constitutional principle.
- A conflict between the Constitution and an authoritative reference MUST be resolved explicitly rather than silently choosing one.

Rationale: Application-wide references prevent each feature from creating its own incompatible product or architecture.

---

### XII. Simplicity and MVP Discipline

The system MUST use the simplest design that safely satisfies the approved requirements.

- The MVP MUST prioritize the core coaching journey defined in `PRD.md`.
- New infrastructure, services, abstractions, and dependencies MUST have an immediate documented need.
- The initial architecture SHOULD remain a modular monolith unless an approved architectural decision establishes a justified change.
- Premature microservices are prohibited.
- Premature optimization is prohibited unless supported by an identified requirement or measured bottleneck.
- New dependencies MUST be evaluated for maintenance, security, licensing, and operational impact.
- Features outside the approved scope MUST NOT be added merely because they are technically convenient.
- Technical debt accepted for delivery MUST be explicit, bounded, and recorded.
- Simplicity MUST NOT be used to bypass safety, privacy, authorization, testing, or maintainability requirements.

Rationale: MVP discipline reduces delivery risk while preserving the controls required by a sensitive product.

---

## Architecture and Development Standards

### Backend

- The backend MUST follow the module boundaries and dependency direction defined in `SAD.md`.
- Controllers MUST handle transport concerns only.
- Application services MUST coordinate use cases.
- Domain logic MUST remain independent of frameworks and providers wherever practical.
- Repository interfaces MUST be owned by the layer that consumes them.
- Infrastructure adapters MUST implement application-owned contracts.
- Database access MUST NOT leak across module boundaries without an approved contract.
- Request validation and response contracts MUST be explicit.
- Protected operations MUST enforce authorization in the backend.
- External-provider failures MUST have defined timeout, retry, and fallback behavior where appropriate.

### Frontend

- The frontend MUST follow `Frontend_Architecture.md`.
- Server state and client-only UI state MUST remain appropriately separated.
- Business rules MUST NOT be duplicated in presentation components.
- UI components MUST remain focused and composable.
- Data access MUST pass through the approved frontend API layer.
- Route protection MUST improve user experience but MUST NOT be treated as authorization.
- Loading, empty, error, offline, and interrupted-stream states MUST be designed explicitly.
- Mutating operations MUST prevent accidental duplicate submission.
- Streaming behavior MUST handle interruption and retry safely.
- Accessibility MUST include keyboard navigation, semantic structure, labels, focus handling, and suitable contrast.
- RTL behavior MUST be covered by testing, not only by setting the `dir` attribute.

### AI and RAG

- AI providers MUST be accessed through application-owned interfaces.
- Prompts MUST be version-controlled.
- AI requests MUST use bounded context.
- Structured responses MUST be schema-validated.
- Retrieval results MUST retain approved source metadata.
- No-result and low-confidence retrieval paths MUST be explicit.
- Model failure MUST produce a safe and understandable product state.
- AI output MUST NOT bypass domain validation.
- AI observability MUST avoid exposing sensitive conversation content.
- Model or prompt changes affecting behavior MUST be evaluated before production release.

### Security and Privacy

- Authentication and session behavior MUST follow `SAD.md`.
- Authorization MUST be enforced for every user-owned resource.
- Input MUST be validated at system boundaries.
- Output MUST be safely encoded for its destination.
- Secrets MUST come from approved runtime configuration.
- Sensitive values MUST be redacted from errors and telemetry.
- Security-sensitive changes MUST include appropriate automated tests.
- Deletion and retention behavior MUST apply to primary and derived data.

---

## Feature Specification Requirements

Every Spec Kit feature specification MUST include:

1. Scope and explicit non-goals.
2. Prioritized user stories.
3. Independently testable acceptance scenarios.
4. Functional requirements.
5. Relevant entities and lifecycle states.
6. Safety impact.
7. Privacy and data impact.
8. AI and RAG behavior, when applicable.
9. Arabic, RTL, and accessibility impact.
10. Failure, fallback, and recovery behavior.
11. Measurable success criteria.
12. A `Reference Alignment` section for:
    - `PRD.md`
    - `SAD.md`
    - `Frontend_Architecture.md`
13. Constitutional compliance notes.
14. Open clarifications that materially affect implementation.

A feature MUST NOT proceed to implementation while material requirements, safety behavior, ownership rules, or architectural conflicts remain unresolved.

---

## Implementation Plan Requirements

Every implementation plan MUST:

- Map work to the approved feature specification.
- Identify affected architectural modules.
- Show dependency direction and integration boundaries.
- Define data-model and migration impact.
- Define API and event contracts.
- Explain safety and privacy implementation.
- Define AI-provider and RAG boundaries where relevant.
- Include a testing strategy by architectural layer.
- Identify files likely to approach the 300-line limit.
- Explain any justified complexity or new dependency.
- Include a `Reference Alignment` section.
- Identify required updates to authoritative project documents.

Plans MUST NOT place business logic in controllers, UI components, provider adapters, or persistence implementations.

---

## Definition of Done

A feature is complete only when:

- Approved acceptance criteria are satisfied.
- The implementation matches the approved specification and plan.
- Safety behavior is implemented and verified.
- Authorization and user-data isolation are verified.
- Privacy, retention, and deletion implications are addressed.
- AI output is validated before affecting domain state.
- Required automated tests pass.
- Formatting, linting, type checking, and builds pass.
- Handwritten source files comply with the 300-line limit.
- No spaghetti code, god objects, or unjustified circular dependencies exist.
- Arabic, RTL, and accessibility requirements are verified where applicable.
- Failure and fallback paths are implemented.
- `PRD.md`, `SAD.md`, and `Frontend_Architecture.md` remain aligned with the implementation.
- Relevant technical and product documentation is updated.
- No known critical or high-severity safety, privacy, or security defect remains.

Incomplete quality gates MUST NOT be hidden by marking the feature complete with follow-up tasks.

---

## Governance

This Constitution governs all Priora Mind specifications, plans, tasks, implementations, reviews, and refactors.

### Precedence

When instructions conflict, apply the following precedence:

1. Safety, legal, privacy, and security obligations.
2. This Constitution.
3. Approved `PRD.md`, `SAD.md`, and `Frontend_Architecture.md`.
4. Approved feature specification.
5. Approved implementation plan.
6. Implementation tasks and local conventions.

A conflict MUST be documented and resolved explicitly before affected implementation continues.

### Amendments

Constitution amendments MUST:

1. State the proposed change and its rationale.
2. Identify affected principles and project documents.
3. Evaluate safety, privacy, architectural, and migration impact.
4. Receive explicit project-owner approval.
5. Update the Constitution version.
6. Update affected templates and reference documents.
7. Include a migration or remediation plan when existing code becomes non-compliant.

### Versioning

The Constitution follows semantic versioning:

- **MAJOR**: Removal or incompatible redefinition of a principle.
- **MINOR**: Addition of a principle or material expansion of mandatory behavior.
- **PATCH**: Clarification or wording improvement without changing obligations.

### Compliance

- Every feature specification and implementation plan MUST include a Constitution Check.
- Code review MUST verify relevant constitutional rules.
- Any approved exception MUST be documented with its scope, rationale, owner, risk, and expiration or remediation condition.
- Exceptions MUST NOT be granted for non-negotiable safety, privacy, authorization, or user-isolation requirements.
- Repeated exceptions indicate an architectural issue and MUST trigger review.
- Existing non-compliance discovered during feature work MUST be documented and addressed according to its risk.

**Version**: 1.0.0  
**Ratified**: 2026-07-29  
**Last Amended**: 2026-07-29