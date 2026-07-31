Priora Mind - Product Requirements Document (PRD)

Version: 1.0 Status: Draft Product: Priora Mind

1. Product Vision

Priora Mind is an AI-powered mental wellness and personal growthplatform that delivers evidence-based CBT coaching and life coachingthrough personalized AI conversations. The platform helps usersunderstand their thoughts, build healthier habits, and work towardmeaningful goals while maintaining strong privacy and safety standards.

The AI is a coaching companion, not a licensed therapist or medicalprofessional.

2. Problem Statement

Many people need structured support for stress, anxiety, negativethinking, and personal growth but cannot always access a coach ortherapist because of cost, availability, or scheduling.

Priora Mind provides structured AI-guided coaching sessions based ontrusted CBT and life-coaching resources.

3. Product Goals

Deliver personalized AI coaching.

Generate coaching plans tailored to each user.

Support Arabic and English conversations.

Base responses on trusted CBT and coaching knowledge.

Track long-term progress.

Prioritize user privacy and safety.

4. Non Goals (MVP)

Medical diagnosis

Medication recommendations

Replacing licensed therapists

Voice/video sessions

Payments

Human therapist marketplace

Community features

5. Product Principles

Evidence-Based First

AI Assists, Never Diagnoses

Safety Before Coaching

User Privacy First

Personalization Over Generic Advice

6. Target Users

Adults seeking personal growth

Users experiencing stress or anxiety

People wanting structured CBT exercises

Users building healthier habits

7. Core User Journey

Register

Verify email

Complete profile

Complete initial assessment

Generate coaching plan

Start coaching session

Chat with AI

Receive exercises

Complete session

Review progress

8. Functional Requirements

Authentication

Register

Email verification

Login

Logout

Password reset

User Profile

Create profile

Update profile

Preferred language

Timezone

Assessment

Complete one versioned initial coaching assessment

Save each answer and resume the single active attempt

Review and revise answers before final submission

Restart an incomplete attempt after confirmation

Score eight equally weighted coaching domains deterministically

Show a non-diagnostic result for each domain without an overall score

Capture one to three user-selected coaching priorities separately fromassessment scores

Keep completed answers and results immutable

The approved question set, scale, scoring formula, result bands, and lifecyclerules are defined in docs/product/Assessment_Specification.md. Retakes andintentional result-history browsing are outside the initial-onboarding feature.

Coaching Plan

Generate AI coaching plan

View plan

Activate plan

Pause plan

Complete plan

Goals

View goals

Track progress

Exercises

View exercises

Complete exercises

Sessions

Start session

Continue active session

End session

View history

AI Chat

Chat with AI

Personalized responses

Session memory

Streaming responses

AI

Generate coaching plans

Generate session summaries

Recommend exercises

Update plans

9. AI Requirements

English knowledge base

Multilingual conversations

Arabic or English responses

Responses grounded in CBT references

Personalized coaching

Structured outputs for plans and summaries

10. Safety Requirements

Deterministic input safety evaluation independent of assessment scoring

Output safety validation

Direct self-harm and immediate-danger safety questions

Risk levels: NORMAL, DISTRESS, HIGH_RISK, and CRISIS

Immediate HIGH_RISK/CRISIS interruption and SAFETY_HOLD routing

Deterministic bilingual safety copy that does not depend on generative AI

Fail-closed behavior when safety evaluation is unavailable

Approved, versioned emergency-resource registry with generic local-servicefallback and no invented contact numbers

No diagnosis

No medication advice

Escalation guidance when required

The decision matrix, routing rules, re-entry behavior, and response copy aredefined in docs/product/Safety_Decision_Matrix.md. Assessment result bandsMUST NOT be treated as safety-risk levels.

11. Non Functional Requirements

Performance

Fast authentication

Streaming AI responses

Responsive UI

Security

Secure authentication

Password hashing

HTTPS

User data isolation

Privacy

User owns their data

Account deletion

Conversation deletion

Explicit versioned consent before profile or assessment collection

Defined expiry for incomplete onboarding and assessment progress

Full account deletion includes consent, assessment, goal, result, andsafety records

Assessment and safety content excluded from logs, analytics, traces, anderror reports

Consent, retention, re-consent, and deletion behavior are defined indocs/product/Consent_and_Data_Retention_Policy.md and require legal/privacyreview before public launch.

Scalability

Modular monolith

Provider-independent AI

Extensible architecture

12. MVP Scope

Included:

Authentication

Profile

Assessment

Coaching plan

Sessions

AI chat

RAG

Safety

Progress tracking

Excluded:

Voice

Payments

Human therapists

Mobile app

Community

13. Success Metrics

Users complete onboarding

Users generate coaching plans

Users complete multiple sessions

User retention

Exercise completion rate

14. Risks

AI hallucinations

Unsafe responses

Poor personalization

User privacy concerns

Mitigations:

RAG

Safety layer

Evidence-based prompts

Human escalation guidance

15. Constraints

English-only knowledge base

Arabic and English conversations

AI coaching only

No medical diagnosis

No medication recommendations

16. Future Roadmap

Voice conversations

Human therapist integration

Mobile applications

Mood tracking

Wearable integrations

Multiple AI specialists

Advanced analytics