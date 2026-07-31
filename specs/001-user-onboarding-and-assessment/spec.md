Feature Specification: User Onboarding and Initial Assessment

Feature Branch: 001-user-onboarding-assessmentFeature Directory: specs/001-user-onboarding-and-assessment

Created: 2026-07-29

Status: Ready for Planning — Safety and Legal launch gates remain

Input: First-time user journey from account access through completion and presentation of the initial coaching assessment result; prepares the user for future coaching-plan creation but does NOT generate or activate a plan.

1. Feature Overview

Priora Mind is an AI-powered mental-wellness and personal-growth coaching platform, not a medical, psychiatric, psychological, diagnostic, or emergency service. This feature defines the first-time user journey: a new user registers, verifies their email, acknowledges the service boundaries and consents to the applicable terms and privacy notice, provides the minimum profile information required by the product, completes the initial coaching assessment, and receives a safe, non-diagnostic assessment result that prepares them for future coaching-plan creation.

The assessment result is produced by deterministic rules, not by generative AI. This feature intentionally contains no AI chat, no RAG/knowledge retrieval, no coaching-plan generation, and no coaching sessions. Safety handling is in scope only to protect the user during onboarding and assessment: separate unscored safety answers are classified into the approved risk levels, and HIGH_RISK/CRISIS answers trigger the approved safety behavior, which takes precedence over normal onboarding completion. Assessment domain scores and result bands are never safety-classification inputs.

The journey ends at a clear transition point toward the future coaching-plan feature, which is explicitly out of scope here.

Clarifications

Session 2026-07-29

Q: When should the deterministic safety evaluation run on assessment answers, and should HIGH_RISK/CRISIS interrupt the in-progress assessment immediately? → A: The safety evaluation runs after each answer AND on final submission. HIGH_RISK pauses the assessment immediately (suspended, not abandoned) and presents the safety response; CRISIS interrupts immediately with the deterministic crisis response. This decouples safety risk from the assessment score — a single safety-sensitive answer triggers routing regardless of total score.

Q: After a HIGH_RISK or CRISIS safety routing, what is the onboarding outcome and is the normal assessment result shown afterward? → A: Onboarding becomes safety-interrupted (SAFETY_HOLD) and no normal result is shown. Re-entry is user-initiated and creates a new Safety Evaluation. A current NORMAL or DISTRESS route may resume the suspended assessment; this does not edit the historical evaluation or claim that a previous crisis clinically ended. Completion still requires a final Safety Evaluation.

Q: What is the assessment lifecycle policy (skip/revise/restart/retake, individual save, single vs retained attempts, revisit-after-completion)? → A: All 16 current-state questions and required goal inputs are mandatory; the personal-importance and expected-obstacle free-text inputs are optional. The user may revise before submission and restart an in-progress assessment. Answers are saved individually. Only one active initial assessment exists per user; incomplete previous attempts are overwritten, not retained as history. After onboarding is COMPLETED, the user cannot retake or intentionally revisit the initial result through this feature.

Q: Which owning modules should be adopted for Consent Record, Onboarding State, assessment scoring, and safety evaluation? → A: Consent Record → Auth module (account-level legal record). Onboarding State → Profile module (user setup state). Assessment scoring → Assessment module. Safety evaluation → a new dedicated Safety module that owns deterministic classification, the HIGH_RISK decision matrix, and the CRISIS response (not in the AI provider integration; separate from Assessment scoring; reusable by future chat/session flows). SAD.md MUST be updated to add the Safety module and these ownership assignments.

Q: When a user deletes their account, how are consent records handled? → A: Full deletion of ALL onboarding/assessment data, including consent records. No consent data is retained. If a separate, approved legal-retention requirement is documented later, it can be carved out; no legal basis is invented now. Re-consent triggers on notice-version change (FR-008) and on any material change to the terms/privacy notice.

Q: What is the approved assessment model? → A: docs/product/Assessment_Specification.md v1.0 defines 16 required current-state questions across eight equally weighted domains, five goal/priority inputs, the five-point two-week frequency scale, deterministic per-domain scoring, four non-diagnostic result bands, and lifecycle/versioning rules. No overall score is calculated or displayed.

Q: What is the approved safety baseline? → A: docs/product/Safety_Decision_Matrix.md v1.0 defines the direct safety questions, independent deterministic classification, routing, bilingual copy, location/resource fallback, SAFETY_HOLD, failure behavior, and re-entry evaluations. Independent professional approval remains mandatory before public launch.

Q: What is the consent and retention baseline? → A: docs/product/Consent_and_Data_Retention_Policy.md v1.0 defines the service-boundary disclosure, explicit acknowledgments, notice-version recording, re-consent, product retention limits, and full deletion behavior. Legal/privacy approval remains mandatory before public launch.

2. Scope

In scope (limited to requirements present in the authoritative documents):

User registration and email verification.

User login, only where required for the onboarding journey (returning users entering an incomplete onboarding).

Language selection between Arabic and English, with correct RTL/LTR behavior.

Presentation of Priora Mind's service boundaries (coaching/wellness, not medical/psychiatric/diagnostic/emergency).

Required consent to the applicable terms and privacy notice.

Collection of only the minimum basic profile information required by the PRD.

Initial assessment introduction, questions, supported answer format, and progress.

Saving assessment answers; resuming an interrupted assessment where supported by the authoritative documents.

Assessment submission with protection against accidental duplicate submission.

Deterministic calculation of the assessment result according to approved rules.

Presentation of the result as a coaching/screening insight — not a clinical diagnosis.

Safe handling of NORMAL, DISTRESS, HIGH_RISK, and CRISIS answers during onboarding/assessment.

Clear completion of onboarding and a transition point toward the future coaching-plan feature (without implementing it).

3. Explicit Non-Goals

This feature MUST NOT implement:

AI-generated coaching plans or coaching-plan activation.

Coaching sessions, general AI chat, RAG, or knowledge retrieval.

Long-term memory, exercise assignment, or structured coaching-plan lifecycle.

Subscription, payment, or admin dashboards.

Clinical diagnosis or medication advice.

Crisis coaching through unrestricted generative AI.

Displaying unapproved hotline numbers, emergency contacts, clinical labels, orgeneratively rewritten safety copy.

4. Assumptions

These are low-risk defaults consistent with the authoritative documents. They are not material ambiguities.

A1 — Minimum profile fields: Per PRD §"User Profile", the minimum basic profile information is the user's preferred language and timezone. The registration email (owned by the Auth module) is the account identifier and is not treated as profile content. No name, age, gender, or other personal attributes are collected in this feature unless a future clarification adds them.

A2 — Save and resume (confirmed): Answers are saved individually, enabling a user to resume an interrupted assessment from the last saved answer. The user may also restart the in-progress assessment, which clears saved answers. Completed results are not intentionally revisitable through this feature. See §5/§9 and Assessment_Specification.md.

A3 — Language default: When no preference is selected, the onboarding language selection screen is presented in a neutral default (English), and the user actively chooses Arabic or English before proceeding. The chosen language is persisted to the profile and drives all subsequent localized content and directionality.

A4 — One active onboarding per user (confirmed): A user has exactly one onboarding state and one active initial assessment. Incomplete previous attempts are overwritten (not retained as history). Repeated or duplicated submissions are deduplicated (see §10, §12), not treated as separate assessments.

A5 — Email verification required to advance: A registered user cannot proceed past service-boundary/consent until email verification completes (PRD journey step 2 precedes step 3).

A6 — Result is deterministic and non-AI: The assessment result and its risk classification are computed by deterministic rules; this feature invokes no generative AI provider.

5. Prioritized User Stories and Acceptance Scenarios

User stories are ordered by priority and are independently testable: implementing any P1 story alone must yield a verifiable, valuable slice. Acceptance scenarios use Given/When/Then.

User Story 1 — Register and enter onboarding (Priority: P1)

A new user creates an account and is taken into the onboarding journey.

Why this priority: Registration is the entry point for every other onboarding step; without it no downstream value is reachable. (PRD §7 journey steps 1–3.)

Independent Test: A new user can register, receive a verification email, verify, and land on the onboarding start screen — verifiable without the assessment.

Acceptance Scenarios:

Given a visitor with no account, When they submit valid registration credentials, Then a UserAccount is created in the REGISTERED state and a verification email is sent.

Given a registered, unverified user, When they follow a valid verification link, Then the UserAccount transitions to EMAIL_VERIFIED and they are placed at the onboarding start (service-boundary/consent step).

Given a registration attempt with an already-registered email, When they submit, Then the system rejects creation without disclosing whether the email exists (to prevent enumeration).

Failure / Safety Scenarios:

Invalid or malformed email/password → clear, localized validation messages; no account created.

Expired or already-used verification link → friendly expired-link state with a re-send option.

Verification email delivery failure → a re-send verification control is available; no silent advancement.

User Story 2 — Understand and accept service boundaries and required consent (Priority: P1)

Before any coaching content, the user understands Priora Mind is not a medical/psychiatric/diagnostic/emergency service and consents to the applicable terms and privacy notice.

Why this priority: The Constitution's "Coaching, Not Clinical Care" and "Safety Before Coaching" principles require clear boundary communication and recorded consent before further engagement. (Constitution I, II, VI; PRD §5.)

Independent Test: A verified user can read the service-boundary disclosure and privacy/terms notice and grant or decline consent; granting consent is recorded and unblocks the profile step.

Acceptance Scenarios:

Given a verified user at the service-boundary step, When the screen loads, Then it clearly states Priora Mind is a coaching/mental-wellness service and is not medical, psychiatric, psychological, diagnostic, or emergency care.

Given the boundary and the applicable terms/privacy notice are presented, When the user grants consent, Then a Consent Record is stored with the notice version(s) and a timestamp, and the user advances to the profile step.

Given the consent step, When the user declines, Then onboarding does not advance and the user is not asked to provide assessment or profile data.

Failure / Safety Scenarios:

The notice version cannot be determined → consent MUST NOT be recorded; the user is shown an error state and cannot proceed (fail closed).

A previously recorded consent exists for an older notice version → the user is re-presented with the current version and must re-consent before advancing.

User Story 3 — Provide minimum profile and choose language/direction (Priority: P1)

The user provides the minimum profile information and selects Arabic or English, which drives the layout direction and localized content.

Why this priority: Profile and language are prerequisites for a personalized, correctly-rendered assessment experience and are part of the PRD journey (steps 3–4). (PRD §8 Profile; Frontend §12.)

Independent Test: A user can set their preferred language and timezone, and the UI immediately reflects the correct direction and localized strings, before entering the assessment.

Acceptance Scenarios:

Given a consented user, When they select Arabic, Then the layout switches to RTL and all subsequent onboarding content is presented in natural Arabic.

Given a consented user, When they select English, Then the layout switches to LTR and content is presented in English.

Given the profile step, When the user saves the minimum profile (language + timezone), Then the Profile/Preferences are persisted and the user advances to the assessment introduction.

Failure / Safety Scenarios:

Invalid timezone or missing required field → localized validation message; no advance.

Language change mid-journey → all prior and subsequent screens re-render in the new language and direction without losing progress.

User Story 4 — Complete and submit the initial assessment (Priority: P1)

The user reads the assessment introduction, progresses through the questions, and submits the assessment.

Why this priority: The assessment result is the core deliverable of this feature and the input to all downstream coaching. (PRD §7 steps 4–5; PRD §8 Assessment.)

Independent Test: A user can complete all required assessment questions and submit once, with progress saved and duplicate submission prevented.

Acceptance Scenarios:

Given a user with a completed profile, When they open the assessment, Then an introduction explains the assessment is a coaching/screening tool, not a diagnosis.

Given an in-progress assessment, When the user answers a question, Then the answer is saved and progress is reflected.

Given all required questions answered, When the user submits, Then the submission is accepted exactly once and the assessment transitions to SUBMITTED.

Failure / Safety Scenarios:

Submit clicked again (double-click / retry) → only one submission is recorded; the user sees the existing result, not a duplicate.

Network failure during submit → the client retries safely; if a submission already succeeded server-side, the stored result is shown rather than creating a new assessment.

Session expired mid-assessment → on re-authentication the user resumes from the last saved answer.

User Story 5 — Receive a safe, non-diagnostic assessment result (Priority: P1)

The user receives a coaching/screening insight computed by deterministic rules, clearly framed as not a diagnosis. The assessment result (a coaching/wellbeing insight) and the safety evaluation (NORMAL/DISTRESS/HIGH_RISK/CRISIS) are separate: the result bands are NOT the safety levels, and the total score does not determine the safety risk.

Why this priority: This is the user-visible outcome of the feature and the hand-off to future coaching. It must be safe and non-clinical. (Constitution I, II; PRD §5.)

Independent Test: A user whose Safety Evaluation is NORMAL or DISTRESS receives a coaching insight framed as non-diagnostic, plus a transition point to future plan creation; a user whose Safety Evaluation is HIGH_RISK/CRISIS is routed per US6 instead.

Acceptance Scenarios:

Given a submitted assessment whose Safety Evaluation is NORMAL, When the result is presented, Then the user sees a non-diagnostic coaching insight, onboarding transitions to COMPLETED, and a transition point toward future coaching-plan creation is shown (without creating a plan).

Given a submitted assessment whose Safety Evaluation is DISTRESS, When the result is presented, Then the user sees a supportive, bounded coaching insight with approved guidance and the same completion/transition behavior.

Given any presented result, When it is shown, Then it explicitly states it is not a medical diagnosis or a substitute for professional care.

Given a submitted assessment whose Safety Evaluation is HIGH_RISK or CRISIS, When safety routing occurs, Then the normal assessment result is NOT presented and onboarding does not complete (see US6 and §10).

Failure / Safety Scenarios:

Deterministic scoring cannot compute the insight (e.g., approved rules missing) → the system MUST NOT present a fabricated result; it shows a safe error state and does not mark onboarding complete.

The assessment result MUST NOT be labeled with or derived from safety-risk levels.

User Story 6 — High-risk or crisis answer receives the correct safety experience (Priority: P1)

A user whose answers indicate HIGH_RISK or CRISIS receives the approved safety behavior, which takes precedence over normal completion.

Why this priority: Safety takes precedence over engagement and feature completion (Constitution II, non-negotiable). (SAD §10.)

Independent Test: Submitting answers that map to HIGH_RISK or CRISIS produces the approved safety response and defers/suppresses the normal result presentation, deterministically and independently of any AI generation.

Acceptance Scenarios:

Given answers classified as CRISIS, When classification completes, Then the system bypasses normal result presentation and shows the approved deterministic crisis response, and safety handling takes precedence over onboarding completion.

Given answers classified as HIGH_RISK, When classification completes, Then the system follows the approved safety decision matrix for routing and messaging.

Given a CRISIS classification, When the response is shown, Then no invented hotline numbers, emergency contacts, or professional resources are displayed; only approved resources, or a direction to local emergency services / a trusted person when reliable local information is unavailable.

Given a historical HIGH_RISK classification, When the user later initiates re-entry and a new Safety Evaluation classifies the current route as NORMAL or DISTRESS, Then the suspended assessment may resume; completion and result presentation still require all required answers plus a final Safety Evaluation.

Given a historical CRISIS classification, When the user later initiates re-entry, Then the system creates a new Safety Evaluation and routes according to its result without editing or downgrading the historical evaluation and without declaring that the earlier crisis clinically ended.

Failure / Safety Scenarios:

The safety service fails during classification → the system MUST fail closed: it MUST NOT proceed to a normal result; it shows a safe fallback and, where appropriate, a direction to local emergency services.

CRISIS response MUST NOT depend on generative AI output.

The system MUST NOT present the normal assessment result while onboarding is in SAFETY_HOLD.

User Story 7 — Arabic/English language selection with correct direction and localization (Priority: P2)

The user selects Arabic or English and receives the correct direction and a natural localized experience throughout onboarding.

Why this priority: First-class bilingual equality is required (Constitution X), but the journey is usable in a single language; full bilingual verification is prioritized P2. (Frontend §12.)

Independent Test: Switching language re-renders every onboarding screen — including validation messages, empty/error states, and safety experiences — in the correct language and direction.

Acceptance Scenarios:

Given any onboarding screen, When the user switches language, Then direction (RTL/LTR) and all localized strings update, including mixed Arabic/English/number/date content.

Given a safety experience, When presented in Arabic or English, Then the safety behavior is equivalent across both languages.

Failure / Safety Scenarios:

A localized string is missing for one language → a defined fallback is shown; the system MUST NOT silently fall back to the other language for safety-critical content without a documented rule.

User Story 8 — Safely resume or restart an interrupted onboarding journey (Priority: P2)

A user who closes the app or loses connection can resume from their last saved point, or restart safely if needed.

Why this priority: Recovery improves robustness but the journey can be re-run from scratch; resumption is P2. (Constitution IX; A2.)

Independent Test: An interrupted user, on return, lands on the correct unfinished step with saved progress intact, or restarts without duplicate data.

Acceptance Scenarios:

Given a user who left onboarding at the assessment, When they return and re-authenticate, Then they resume at the last saved assessment question.

Given a user with an incomplete onboarding, When they attempt to access a protected app area that requires completed onboarding, Then they are redirected to the correct unfinished onboarding step.

Given a user who restarts the assessment, When they submit, Then no duplicate assessment records are created beyond the single active assessment.

Failure / Safety Scenarios:

Saved progress is inconsistent/corrupt → the user is offered a safe restart; no partial result is presented as a completed assessment.

User Story 9 — Existing authenticated user with completed onboarding is routed correctly (Priority: P2)

A returning authenticated user who already completed onboarding is not forced through it again and is routed to the appropriate post-onboarding destination.

Why this priority: Prevents regression for existing users once the future coaching feature exists; defines the onboarding completion boundary. (Frontend §7 routing.)

Independent Test: An authenticated user whose onboarding state is COMPLETED is routed to the post-onboarding landing destination and cannot re-enter onboarding unconditionally.

Acceptance Scenarios:

Given an authenticated user with onboarding COMPLETED, When they navigate to the app entry, Then they bypass onboarding and reach the post-onboarding destination (currently the transition point / dashboard placeholder).

Given an authenticated user with incomplete onboarding, When they log in, Then they are routed to the next unfinished onboarding step.

Failure / Safety Scenarios:

The onboarding state cannot be determined → the user is routed to the earliest unfinished step rather than assuming completion.

6. Independently Testable Acceptance Scenarios

Acceptance scenarios are embedded per user story in §5 so that each story is independently testable. Cross-cutting acceptance, not owned by a single story:

AC-X1: Onboarding completion is observable and distinct from incompletion: a COMPLETED user has a persisted onboarding state, a recorded assessment result, and a transition point; an incomplete user does not.

AC-X2: Safety routing is independently testable: direct safety-answer fixtures produce NORMAL, DISTRESS, HIGH_RISK, and CRISIS routes without invoking generative AI, and assessment domain scores never change those routes.

AC-X3: Authorization is independently testable: a user cannot read or submit another user's assessment, answers, result, or consent record.

AC-X4: Duplicate-submission protection is independently testable: a repeated submit for the same assessment yields exactly one result.

7. Edge Cases

Expired verification link or expired session mid-onboarding (see US1, US8).

Double-submit / network retry during assessment submission (see US4, AC-X4).

User changes language or direction mid-assessment (see US3, US7).

User declines consent (no further data collected).

Assessment interrupted by a CRISIS/HIGH_RISK classification before all questions are answered (safety takes precedence; see §10).

Inconsistent or corrupt saved progress (offer safe restart; never present a partial result as complete).

Repeated registration attempts / email enumeration (prevent disclosure).

Concurrent submission from multiple sessions/tabs for the same user (deduplicate to one result).

Missing localized string for one language (defined fallback; no silent cross-language fallback for safety content).

Notice version changes between consent presentation and recording (re-present; fail closed).

Deterministic scoring rules unavailable/unable to classify (safe error; do not fabricate a result).

8. Functional Requirements

Stable IDs. Each requirement is testable. "MUST" denotes a non-negotiable requirement.

Registration & Authentication

FR-001: The system MUST allow a new visitor to register a UserAccount with an email and credential, creating the account in the REGISTERED state.

FR-002: The system MUST send an email verification and transition the account to EMAIL_VERIFIED upon a valid verification link, before allowing advancement past the consent step.

FR-003: The system MUST allow a returning authenticated user to log in according to the authentication behavior defined in SAD.md (password hashing, JWT, refresh tokens, HTTPS). No alternative frontend token-storage strategy MAY be introduced.

FR-004: Registration and login error responses MUST NOT disclose whether an email is already registered (anti-enumeration).

Service Boundaries & Consent

FR-005: The onboarding MUST present the service-boundary disclosure stating Priora Mind is a coaching/mental-wellness service and is not medical, psychiatric, psychological, diagnostic, or emergency care, before any coaching or assessment content.

FR-006: The onboarding MUST present the applicable terms and privacy notice and require explicit consent before advancing.

FR-007: Consent MUST be recorded as a Consent Record capturing the notice version(s), timestamp, and user; consent MUST NOT be recorded if the notice version cannot be determined (fail closed).

FR-008: If the notice version changes, the system MUST require re-consent before further onboarding.

Profile & Language

FR-009: The system MUST collect only the minimum profile information required by the PRD (preferred language and timezone) and MUST NOT collect additional personal attributes in this feature.

FR-010: The system MUST allow the user to select Arabic or English; the selection MUST be persisted to the Profile/Preferences and MUST drive layout direction (RTL/LTR) and localized content for all subsequent onboarding screens.

FR-011: Changing language MUST re-render all visible onboarding content and direction without losing saved progress.

Assessment

FR-012: The system MUST present an assessment introduction stating the assessment is a coaching/screening tool, not a diagnosis.

FR-013: The assessment MUST use Assessment_Specification.md v1.0: 16 required current-state questions across eight equally weighted domains, plus five goal/priority inputs. Current-state answers use the approved five-point frequency scale for the previous two weeks. AG-04 and AG-05 are optional; all other defined inputs are required.

FR-014: The system MUST save answers individually as the user progresses, enabling resume from the last saved answer.

FR-014a: All 16 current-state questions plus AG-01, AG-02, and AG-03 MUST be completed before submission. AG-04 and AG-05 are optional and MAY be skipped.

FR-014b: The user MAY revise any saved answer before submission. The user MAY restart the in-progress assessment, which clears saved answers and begins a fresh attempt on the single active assessment.

FR-015: The system MUST prevent accidental duplicate submission: a repeated submit for the same assessment MUST yield exactly one result.

FR-016: The system MUST compute eight integer domain scores and their result bands using the deterministic polarity, formula, thresholds, and tie behavior in Assessment_Specification.md v1.0. It MUST NOT calculate or display an overall score.

FR-017: The result MUST be presented as a coaching/screening insight and MUST explicitly state it is not a medical diagnosis or a substitute for professional care.

FR-018: On a submitted, scored assessment whose Safety Evaluation is NORMAL or DISTRESS, onboarding MUST transition to COMPLETED and present the non-diagnostic coaching insight plus a transition point toward the future coaching-plan feature WITHOUT generating or activating a plan. The assessment result (insight bands) is separate from the safety evaluation and MUST NOT be derived from safety levels.

FR-018a: Only one active initial assessment exists per user; incomplete previous attempts are overwritten, not retained as history. After onboarding is COMPLETED, the user MUST NOT be able to retake the assessment or revisit the initial result through this feature.

Safety

FR-019: The Safety module MUST create versioned Safety Evaluations and classify the current route as NORMAL, DISTRESS, HIGH_RISK, or CRISIS using Safety_Decision_Matrix.md v1.0. This classification is SEPARATE from the deterministic assessment result and MUST NOT be derived from assessment result bands.

FR-019a: The safety evaluation MUST run after each answer is saved AND on final submission, so a single safety-sensitive answer can trigger routing before the assessment is finished.

FR-019b: HIGH_RISK MUST pause the assessment immediately (Assessment state SUSPENDED; saved answers retained) and present the safety response. CRISIS MUST interrupt immediately with the approved deterministic crisis response.

FR-020: CRISIS MUST bypass normal result presentation and use the approved deterministic safety response; it MUST NOT depend on generative AI.

FR-021: HIGH_RISK MUST follow the routing and exact bilingual deterministic copy in Safety_Decision_Matrix.md v1.0.

FR-022: DISTRESS MUST receive supportive, bounded, context-appropriate messaging plus the normal completion/transition path.

FR-023: Safety handling MUST take precedence over normal onboarding completion.

FR-024: The system MUST NOT invent hotline numbers, emergency contacts, or professional resources; only approved resources MAY be shown, or a direction to local emergency services / a trusted person when reliable local information is unavailable.

FR-025: Safety-service failures MUST fail closed: the system MUST NOT proceed to a normal result; it MUST present a safe fallback and, where appropriate, a direction to local emergency services.

FR-026: Safety classification and routing MUST be independently testable via fixtures without invoking generative AI.

Privacy & Authorization

FR-027: Every user-owned record created in this feature (Profile, Consent Record, Onboarding State, Assessment, answers, result, Safety Evaluation) MUST be associated with the verified owner.

FR-028: The backend MUST enforce user-data isolation on every protected operation; frontend route guards MUST NOT be treated as a security boundary.

FR-029: The system MUST prevent cross-user access to assessment answers, results, consent, and onboarding state.

FR-030: Sensitive assessment content (answers, results, risk classification) MUST NOT appear in application logs, analytics events, traces, or error reports.

FR-031: Retention and account deletion MUST follow Consent_and_Data_Retention_Policy.md v1.0, including expiry of incomplete progress and full deletion of primary, derived, cached, indexed, consent, assessment, goal, result, and safety data. No legal-retention exception is assumed unless separately approved and documented.

FR-032: The service-boundary disclosure, explicit acknowledgments, version identifiers, and re-consent behavior MUST follow Consent_and_Data_Retention_Policy.md v1.0. Final Terms and Privacy Notice text/links require legal approval before public launch.

Resilience & State

FR-033: The system MUST distinguish incomplete from completed onboarding and route users accordingly (returning completed users bypass onboarding; incomplete users resume at the unfinished step).

FR-034: The system MUST handle interrupted, duplicated, or repeated submissions safely (deduplicate to one result; resume from saved progress; offer safe restart on corrupt progress).

FR-035: The system MUST define loading, empty, error, offline, expired-session, and retry states for each onboarding step per Frontend_Architecture.md.

Accessibility & i18n

FR-036: All onboarding screens MUST provide keyboard navigation, semantic labels, focus handling, and suitable contrast, in both LTR and RTL.

FR-037: Validation messages, error/empty/loading states, and safety experiences MUST be available in both Arabic and English.

9. Relevant Entities, Ownership, and Lifecycle States

Product-level entities only; no database tables or implementation classes. Ownership follows SAD.md §5 module boundaries; every entity below has one resolved owner.

UserAccount (Owner: Auth module). States: REGISTERED → EMAIL_VERIFIED. Transitions: created on register; verified on valid verification link. (SAD §5 Auth owns UserAccount, VerificationToken, RefreshToken.)

Profile / Preferences (Owner: Profile module). Lifecycle: created during onboarding once consent is granted; updated when language/timezone are set. (SAD §5 Profile owns Profile, Preferences.)

Consent Record (Owner: Auth module — account-level legal record; SAD updated). Lifecycle: REQUESTED → GRANTED (with notice version(s) + timestamp). A new notice version forces a new REQUESTED → GRANTED cycle.

Onboarding State (Owner: Profile module — user setup state; SAD updated). States: NOT_STARTED → IN_PROGRESS → ASSESSMENT_PENDING → ASSESSMENT_IN_PROGRESS → ASSESSMENT_SUBMITTED → COMPLETED, plus SAFETY_HOLD. HIGH_RISK or CRISIS enters SAFETY_HOLD, which blocks result presentation and completion. Re-entry is user-initiated and creates a new Safety Evaluation. A current NORMAL or DISTRESS route permits assessment resume; this changes only the current product route and does not edit or clinically reinterpret historical Safety Evaluations. Completion still requires all assessment inputs and a final Safety Evaluation.

Assessment (Owner: Assessment module). States: NOT_STARTED → IN_PROGRESS → SUSPENDED (on HIGH_RISK, with saved answers retained and resumable) → SUBMITTED → SCORED. A CRISIS classification interrupts immediately and routes to the safety response; the assessment does not advance to SUBMITTED while in crisis routing. (SAD §5 Assessment owns Assessment, AssessmentAnswer.)

Assessment Question Definition (Owner: Assessment module, versioned reference content). Assessment_Specification.md v1.0 defines the approved IDs, bilingual wording, domain, polarity, scale, required/optional status, and scoring behavior.

Assessment Answer (AssessmentAnswer) (Owner: Assessment module). Lifecycle: created/updated individually per question; persisted to enable resume; finalized on submit. A restart clears saved answers and begins a fresh attempt on the single active assessment (previous incomplete attempts are overwritten).

Assessment Result (Owner: Assessment module, derived deterministically by Assessment-owned scoring). Carries the coaching/screening insight. It is SEPARATE from the Safety Evaluation. After onboarding is COMPLETED, the result is not revisitable or retakeable through this feature.

Safety Evaluation (Owner: Safety module — SAD updated). An immutable, versioned evaluation that produces NORMAL/DISTRESS/HIGH_RISK/CRISIS deterministically and without generative AI. Re-entry creates a new evaluation; historical evaluations are retained according to policy and never overwritten. Safety evaluation is separate from Assessment scoring and from the AI provider integration.

10. Safety Impact and Expected Routing

Safety behavior complies with Constitution II (Safety Before Coaching) and SAD §10. Because this feature has no generative AI, safety here is deterministic classification of separate unscored safety answers plus the approved safety responses. Safety risk is separate from the assessment score: the assessment result is a non-diagnostic coaching/wellbeing insight, while the safety evaluation is an independent NORMAL/DISTRESS/HIGH_RISK/CRISIS classification. A single safety-sensitive answer triggers safety routing regardless of all assessment-domain scores.

Evaluation timing: The safety evaluation runs (a) after each answer as it is saved, and (b) again on final submission. This allows a single safety-sensitive answer to be caught before the assessment is finished.

Immediate interruption: HIGH_RISK pauses the assessment immediately (state SUSPENDED — the assessment is not abandoned; saved answers are retained) and presents the safety response. CRISIS interrupts immediately and shows the approved deterministic crisis response; it does not depend on generative AI.

NORMAL: Proceed to result presentation, onboarding COMPLETED, and the transition point to the future coaching-plan feature.

DISTRESS: Supportive, bounded messaging plus the normal result/completion/transition path.

HIGH_RISK: Bypass normal completion; follow the approved safety decision matrix for messaging and routing; defer the standard result/transition; direct the user toward appropriate professional support using only approved resources. The assessment enters SUSPENDED and onboarding enters SAFETY_HOLD.

CRISIS: Bypass normal result presentation entirely; show the approved deterministic crisis response; do not depend on generative AI; show only approved resources, or a direction to local emergency services / a trusted person when reliable local information is unavailable. Onboarding enters SAFETY_HOLD.

Precedence: Safety handling MUST take precedence over onboarding completion. SAFETY_HOLD blocks COMPLETED.

Fail closed: Safety-service failure MUST NOT permit normal completion or a normal result.

No fabrication: No invented hotline numbers, emergency contacts, or professional resources.

Testability: Safety classification and routing MUST be covered by automated tests using answer fixtures, independent of AI generation (Constitution IX).

The approved planning baseline is Safety_Decision_Matrix.md v1.0. No hotlinenumber or country resource is shown unless it exists in the approved versionedresource registry; missing or unverified resource data uses the generic localemergency-services and trusted-person fallback.

11. Privacy and Data Impact

Ownership & isolation: Every record is associated with the verified owner; backend enforces isolation on every protected operation; cross-user access is prevented (FR-027..FR-029).

Minimum collection: Only email (account identifier) and the minimum profile (language, timezone) are collected; assessment answers are the minimum necessary for the result.

Consent recording: Consent is recorded with notice version(s) and timestamp; no invented legal wording (FR-006..FR-008, FR-032).

Protection of sensitive content: Assessment answers and results MUST NOT appear in logs, analytics, traces, or error reports (FR-030).

Retention and deletion: Apply the product limits in Consent_and_Data_Retention_Policy.md v1.0. Incomplete assessment and onboarding progress expires after the defined inactivity periods; completed data is retained while the account exists; account deletion removes consent, onboarding, assessment, goal, result, safety, cached, indexed, and derived copies. No legal-retention exception is assumed without a separately approved policy update.

Authentication: Strictly per SAD.md (password hashing, JWT, refresh tokens, HTTPS); no new frontend token-storage strategy (FR-003).

AI provider context: This feature does not send any user content to an AI provider (no AI generation). Constitution VII (bounded context) is satisfied vacuously for this feature.

Interrupted/duplicate submissions: Deduplicated to one result; resume from saved progress (FR-015, FR-034).

12. Arabic, RTL, Localization, and Accessibility

Both Arabic and English are first-class (Constitution X). The user-facing language follows the user's preference (FR-010).

Arabic MUST render RTL; English MUST render LTR. Directionality MUST be correct for mixed Arabic, English, numbers, dates, and technical content.

Localized content MUST be natural and contextually appropriate, not literal translation. Localization strings MUST NOT be hard-coded UI text (per Frontend §12 / Constitution X).

Accessibility MUST include keyboard navigation, semantic structure, labels, focus handling, and suitable contrast, in both LTR and RTL (FR-036).

Validation messages, error/empty/loading/streaming states, and safety experiences MUST be available in both languages (FR-037). Safety behavior MUST be equivalent across languages.

A defined fallback exists for missing strings; safety-critical content MUST NOT silently fall back to the other language without a documented rule.

RTL behavior MUST be covered by testing, not only by setting the dir attribute (Constitution X).

13. Failure, Fallback, Retry, and Recovery

Loading/empty/error states: Each onboarding step defines loading, empty, error, offline, expired-session, and retry states (FR-035).

Expired session: Re-authentication returns the user to the correct unfinished onboarding step with saved progress (US8).

Submit failure/retry: Network failure during submit retries safely; an already-succeeded server submission is shown rather than duplicated (US4, FR-015).

Safety failure: Fails closed to a safe fallback; never permits a normal result or completion (FR-025).

Scoring failure: If deterministic rules cannot classify or score, the system MUST NOT fabricate a result; it shows a safe error state and does not mark onboarding complete (US5).

Corrupt progress: Offer a safe restart; never present a partial result as a completed assessment (US8).

Provider independence: Because no AI provider is invoked in this feature, provider-failure handling is not applicable here; any future introduction of AI in this flow MUST follow Constitution V and SAD §8.

14. Measurable, Technology-Agnostic Success Criteria

SC-001: A new user can complete the full onboarding journey (register → verify → consent → profile → assessment → result) and reach the transition point, without encountering an unhandled dead-end.

SC-002: A user who submits the assessment receives a result that is explicitly framed as a non-diagnostic coaching/screening insight, in both Arabic and English.

SC-003: A repeated/duplicate assessment submission produces exactly one result record (duplicate-submission protection is verifiable).

SC-004: A CRISIS answer fixture yields the deterministic crisis response (no generative AI), and a HIGH_RISK fixture follows the safety decision matrix — each verifiable independently of the UI.

SC-005: Switching to Arabic or English produces correct direction and fully localized content across every onboarding screen, including safety experiences.

SC-006: All interactive onboarding controls are operable by keyboard alone, with correct focus order and visible focus in both LTR and RTL.

SC-007: An interrupted user, on return, resumes at the correct unfinished step with saved progress, or restarts safely without duplicate data.

SC-008: A user cannot access, read, or submit another user's onboarding data, assessment, result, or consent (authorization/isolation is verifiable).

SC-009: An authenticated user with completed onboarding bypasses onboarding and reaches the post-onboarding destination.

SC-010: No assessment answers or results appear in logs, analytics, traces, or error reports (verifiable by inspection of emitted telemetry).

15. Dependencies on Future Features

Coaching-plan generation/activation: This feature ends at a transition point; it does not generate or activate a plan. The future coaching-plan feature consumes the persisted assessment result and the COMPLETED onboarding state.

Coaching sessions / AI chat / RAG / exercises / long-term memory: Explicitly out of scope; no dependency is created here.

Account deletion tooling: This feature requires that account deletion covers onboarding/assessment data; the deletion mechanism itself is owned at the platform level.

16. Resolved Clarifications and Launch Gates

All material product decisions required for /speckit.plan are resolved:

Assessment: docs/product/Assessment_Specification.md v1.0 is theauthoritative question, scale, scoring, result, lifecycle, and versioningreference.

Safety: docs/product/Safety_Decision_Matrix.md v1.0 is theauthoritative deterministic classification, routing, copy, fallback,resource-governance, and SAFETY_HOLD reference.

Consent and retention:docs/product/Consent_and_Data_Retention_Policy.md v1.0 is theauthoritative product baseline for notice presentation, version recording,re-consent, retention, and deletion.

Ownership: Consent Record → Auth; Onboarding State → Profile;deterministic assessment scoring → Assessment; deterministic safetyevaluation → Safety.

No [NEEDS CLARIFICATION] markers remain. The feature may proceed to/speckit.plan.

The following are public-launch approval gates, not planningclarifications:

A qualified safety reviewer must approve the safety questions,classification rules, bilingual copy, re-entry behavior, and emergencyresource governance.

Legal/privacy reviewers must approve the final Terms, Privacy Notice,service-boundary/consent wording, retention periods, age/residency rules,and deletion/backup commitments for every launch jurisdiction.

No country-specific emergency number or resource may ship until it isapproved and versioned in the resource registry.

17. Reference Alignment

PRD.md

Alignment: This feature implements PRD §7 journey steps 1–4 (Register, Verify email, Complete profile, Complete initial assessment) and stops before step 5 (Generate coaching plan). It covers PRD §8 Authentication, User Profile, and Assessment functional requirements; PRD §10 Safety Requirements (input safety, crisis/self-harm detection, no diagnosis, escalation guidance); PRD §9 multilingual (Arabic/English) requirements; and PRD §11 Privacy (user owns data, account/conversation deletion, data isolation). It respects PRD §4 Non-Goals and §12 MVP scope by excluding plans, sessions, AI chat, RAG, payments, and community.

Conflict: None.

Ambiguity: Resolved through the three versioned product documents.

Missing decision: None for planning.

Required update to PRD.md: ✅ Applied — PRD §8, §10, and §11 now reference the approved assessment, safety, consent, retention, and deletion baselines.

SAD.md

Alignment: Uses Auth (UserAccount, VerificationToken, RefreshToken, Consent Record), Profile (Profile, Preferences, Onboarding State), and Assessment (Assessment, AssessmentAnswer, deterministic scoring) modules per SAD §5, and the new Safety module for deterministic safety classification (risk levels NORMAL/DISTRESS/HIGH_RISK/CRISIS per SAD §10). Authentication follows SAD §13 (HTTPS, password hashing, JWT, refresh tokens, data isolation). No AI provider is invoked, so SAD §7/§8 AI flow is not exercised here; the assessment result is deterministic (no AI module DTO persistence needed).

Conflict: None.

Ambiguity: Resolved — the non-AI safety classification is owned by a dedicated Safety module, separate from Assessment scoring and from the AI provider integration; the AI module's Safety sub-component remains for generative-AI output validation only.

Missing decision: Resolved by the approved ownership package (see §Clarifications). SAD.md has been updated accordingly.

Required update to SAD.md: ✅ Applied — added the Safety module (§5, §10) with ownership of deterministic safety classification and the safety response/decision matrix; assigned Consent Record to Auth and Onboarding State to Profile; recorded ADR-006.

Frontend_Architecture.md

Alignment: Uses the public/protected routing model (§7) — registration/verification are public; onboarding steps are protected and gated by onboarding state. Follows feature-first organization (§4) with an onboarding feature area; forms use React Hook Form + Zod (§11); state management separates server state (TanStack Query) from local UI state (§8); API access only through the service layer (§9); i18n with RTL/LTR and locale switching (§12); the design system (§13) and error/empty/loading states (§14) apply. Defines loading, empty, error, offline, expired-session, and retry states (§14, §16).

Conflict: None.

Ambiguity: Frontend §7 does not enumerate an explicit onboarding route segment set; route names for onboarding steps are left to the plan within the protected-route convention.

Missing decision: None new.

Required update to Frontend_Architecture.md: None required; if onboarding routes are finalized in the plan, they may be added to §7 for synchronization.

Summary of Conflicts / Ambiguities / Missing Decisions / Required Updates

Conflicts: None.

Ambiguities: (1) Placement of non-AI safety classification — RESOLVED (dedicated Safety module). (2) Onboarding route segments not enumerated in Frontend §7 — deferred to the plan.

Missing decisions: None for planning. Consent Record (Auth), Onboarding State (Profile), assessment scoring (Assessment), safety evaluation (Safety module), and the three product baselines are resolved. Safety and legal/privacy review remain public-launch gates in §16.

Required updates to authoritative documents: SAD.md ✅ applied (Safety module + ownership + ADR-006); PRD.md ✅ applied (assessment, safety, consent, retention, and deletion baselines); Frontend_Architecture.md optional (onboarding routes at plan time).

18. Constitution Check

I. Coaching, Not Clinical Care ✅ — Service boundaries are presented (FR-005), results are non-diagnostic (FR-017), no diagnosis/medication, limitations communicated during onboarding, out-of-scope requests directed to professional support. US2, US5.

II. Safety Before Coaching ✅ — Deterministic risk classification, CRISIS deterministic bypass, HIGH_RISK decision matrix, fail-closed, no fabricated resources, safety precedes completion, independently testable (FR-019..FR-026, §10). US6.

III. Evidence-Grounded and Bounded AI ✅ (N/A-by-design) — This feature invokes no generative AI and presents no AI-generated content; the result is deterministic. No RAG/knowledge retrieval. No fabrication of results (FR-016, US5 failure path).

IV. Domain Ownership and Human-Controlled AI ✅ — No AI DTOs in this feature. Ownership is resolved: Consent Record → Auth; Onboarding State → Profile; assessment scoring → Assessment; safety evaluation → dedicated Safety module (SAD updated). Safety rules are not owned by an AI provider integration; scoring and safety evaluation are separate responsibilities. No business logic in controllers/UI.

V. Structured Coaching Experience ✅ (boundary-respecting) — Onboarding is a structured journey with explicit states and a clear completion condition; no open-ended chat; no plan lifecycle is created here (correctly deferred).

VI. Privacy, Data Isolation, and User Control ✅ — Verified ownership, backend isolation, route guards not a security boundary, no sensitive content in logs/analytics/traces, auth per SAD, no new token storage, minimum collection, versioned consent, defined product retention limits, and deletion of derived data (FR-027..FR-032, §11).

VII. Explicit and Limited Context and Memory ✅ (vacuously) — No AI context is constructed in this feature; no conversation history or memory is created. Long-term memory is out of scope.

VIII. Clean, Modular, and Maintainable Code ⏳ — Spec-level; implementation will respect SAD module boundaries, no business logic in controllers/UI, and the 300-line rule. Verified at plan/implementation time.

IX. Testing and Verifiable Behavior ✅ — Safety classification/routing, crisis bypass, authentication, user-data isolation, lifecycle transitions, RTL-sensitive behavior, and duplicate-submission protection are all designated for automated tests with answer fixtures (FR-026, SC-003, SC-004, SC-008, §10).

X. Arabic and English Quality Equality ✅ — First-class bilingual, RTL/LTR, natural localization, safety equivalence across languages, RTL covered by testing (FR-010, FR-036, FR-037, §12). US7.

XI. Authoritative Project References ✅ — This spec includes Reference Alignment (§17) covering PRD, SAD, and Frontend; conflicts/ambiguities/missing decisions/required updates are listed; no silent invention.

XII. Simplicity and MVP Discipline ✅ — Simplest design that safely satisfies the requirements: no AI, no plan lifecycle, no sessions, no payments; minimum profile; only infrastructure needed. Out-of-scope features excluded. No premature optimization or microservices.

Conclusion: The specification is consistent with the Constitution and theauthoritative references and is ready for /speckit.plan. Public launch remainsblocked by the safety and legal/privacy approvals listed in §16.