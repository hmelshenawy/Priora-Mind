Priora Mind — Safety Decision Matrix

Version: 1.0Status: Product Safety Baseline — Independent Professional Review Required Before Public LaunchOwner: Safety ModuleFeature: 001-user-onboarding-and-assessmentLast updated: 2026-07-29

1. Purpose

This document defines deterministic safety behavior for onboarding and theinitial assessment. Safety takes precedence over coaching, scoring, engagement,and onboarding completion.

This is a product-routing policy, not a clinical diagnosis or clinical riskassessment. It MUST be reviewed by a suitably qualified safety professionalbefore public launch.

2. Separation from Assessment Results

Assessment scores describe coaching domains.

Safety classification describes required product routing.

Safety levels are NORMAL, DISTRESS, HIGH_RISK, and CRISIS.

Safety answers are not included in domain scores.

A single safety-sensitive answer may determine the safety level.

No generative AI may classify or produce required safety messaging.

3. Required Safety Check

The following unscored questions are required during the initial assessment.They do not count among the 21 coaching questions.

SQ-01 — Recent self-harm thoughts

EN: During the past two weeks, have you had thoughts of harming yourself or that you would be better off not being alive?

AR: خلال الأسبوعين الماضيين، هل راودتك أفكار بإيذاء نفسك أو بأنك ستكون أفضل لو لم تكن على قيد الحياة؟

Options:

Code

English

العربية

S0

No

لا

S1

Yes, but not now

نعم، ولكن ليس الآن

S2

Yes, including now

نعم، بما في ذلك الآن

SX

Prefer not to answer

أفضل عدم الإجابة

SQ-02 — Immediate danger

SQ-02 is shown immediately when SQ-01 is S1, S2, or SX.

EN: Are you in immediate danger now, or do you believe you may act on these thoughts soon?

AR: هل أنت في خطر فوري الآن، أو تعتقد أنك قد تتصرف بناءً على هذه الأفكار قريبًا؟

Options:

Code

English

العربية

D0

No

لا

D1

Yes or I am not sure

نعم أو لست متأكدًا

DX

Prefer not to answer

أفضل عدم الإجابة

The wording is direct by design. It MUST not be softened in a way that changesmeaning.

SQ-03 — Current functional distress

SQ-03 is an unscored self-report question asked during the initial assessment. It can classify DISTRESS only. It MUST NOT produce HIGH_RISK or CRISIS, and it MUST NOT downgrade a HIGH_RISK or CRISIS classification produced by SQ-01 or SQ-02 (highest-risk-wins).

EN: Over the past two weeks, has emotional distress made it hard for you to function in your daily life?

AR: خلال الأسبوعين الماضيين، هل جعل الضيق النفسي أداء مهام حياتك اليومية أمرًا صعبًا عليك؟

Options:

| Code | English | العربية |
|---|---|---|
| F0 | No | لا |
| F1 | Some days | بعض الأيام |
| F2 | Most days | معظم الأيام |
| FX | Prefer not to answer | أفضل عدم الإجابة |

4. Evaluation Timing

Safety evaluation runs:

After every saved assessment answer.

Immediately after SQ-01 and, when shown, SQ-02.

Immediately after SQ-03.

On submission against the complete answer set.

On optional free text using an approved deterministic phrase/rule set.

Free-text rules may escalate for review or show the direct safety check, butMUST NOT downgrade the classification created by direct safety answers.

5. Classification Matrix

The highest applicable level always wins.

Condition

Classification

Assessment state

Onboarding state

Result

SQ-01=S2

CRISIS

Interrupted

SAFETY_HOLD

Suppressed

SQ-02=D1

CRISIS

Interrupted

SAFETY_HOLD

Suppressed

SQ-02=DX after S1, S2, or SX

CRISIS

Interrupted

SAFETY_HOLD

Suppressed

SQ-01=S1 and SQ-02=D0

HIGH_RISK

SUSPENDED

SAFETY_HOLD

Deferred

SQ-01=SX and SQ-02=D0

HIGH_RISK

SUSPENDED

SAFETY_HOLD

Deferred

SQ-03=F2 (and no HIGH_RISK or CRISIS from SQ-01/SQ-02)

DISTRESS

Continues

In progress

Available after safe completion

SQ-03 classifies DISTRESS only. It MUST NOT produce HIGH_RISK or CRISIS, and MUST NOT downgrade a HIGH_RISK or CRISIS classification from SQ-01 or SQ-02. When SQ-01 or SQ-02 already classify HIGH_RISK or CRISIS, that classification wins regardless of SQ-03 (highest-risk-wins).

No high-risk answer, but approved distress pattern is met

DISTRESS

Continues

In progress

Available after safe completion

No safety trigger

NORMAL

Continues

In progress

Available after completion

For MVP, the deterministic distress pattern is:

Three or more assessment domains score below 25; or

The Mood domain scores below 25.

DISTRESS does not establish a diagnosis. It adds bounded supportive messagingand does not block completion.

6. Routing Behavior

NORMAL

Continue the assessment.

Present the normal non-diagnostic result after valid submission.

Complete onboarding.

DISTRESS

Continue the assessment.

Present supportive, non-diagnostic language with the normal result.

Encourage the user to consider support from a qualified professional if thedifficulties are persistent, worsening, or affecting daily life.

Complete onboarding.

HIGH_RISK

Pause immediately and retain saved progress.

Move the assessment to SUSPENDED.

Move onboarding to SAFETY_HOLD.

Do not display domain results or continue into coaching.

Present the deterministic high-risk response.

Offer the user a clear action to seek prompt human support.

Permit user-initiated re-entry later; do not claim that the risk has ended.

CRISIS

Interrupt immediately.

Move onboarding to SAFETY_HOLD.

Do not continue questions, score, display results, or enter coaching.

Present the deterministic crisis response.

Prioritize contacting local emergency services and a trusted nearby person.

Do not auto-resume or claim that the crisis has clinically ended.

7. Approved Deterministic Copy

DISTRESS

English

Your answers suggest that several areas may feel difficult right now. This isnot a diagnosis. You can continue, and you may also consider speaking with aqualified professional if these difficulties persist, worsen, or interferewith daily life.

العربية

تشير إجاباتك إلى أن عدة جوانب قد تكون صعبة عليك حاليًا. هذه ليست نتيجةتشخيصية. يمكنك الاستمرار، وقد يكون من المفيد أيضًا التحدث مع مختص مؤهل إذااستمرت هذه الصعوبات أو ازدادت أو أثرت في حياتك اليومية.

HIGH_RISK

English

Thank you for telling us. Your safety matters more than continuing thisassessment. Priora Mind is not an emergency or clinical service. Please seekprompt support from a qualified professional and tell someone you trust whocan support you. If you begin to feel in immediate danger, contact your localemergency services now.

العربية

شكرًا لأنك أخبرتنا. سلامتك أهم من استكمال هذا التقييم. Priora Mind ليست خدمةطوارئ أو خدمة علاجية. يُرجى طلب دعم عاجل من مختص مؤهل، وإخبار شخص تثق بهويمكنه دعمك. إذا شعرت أنك أصبحت في خطر فوري، فاتصل بخدمات الطوارئ المحليةالآن.

CRISIS

English

Your answers indicate that you may be in immediate danger. Priora Mind cannotprovide emergency help. Contact your local emergency services now, and ifpossible move to a safer place and ask a trusted person nearby to stay withyou. Do not remain alone while you may be in immediate danger.

العربية

تشير إجاباتك إلى أنك قد تكون في خطر فوري. لا تستطيع Priora Mind تقديم مساعدةطارئة. اتصل بخدمات الطوارئ المحلية الآن، وانتقل إن أمكن إلى مكان أكثر أمانًاواطلب من شخص تثق به وقريب منك أن يبقى معك. لا تبق وحدك ما دمت قد تكون في خطرفوري.

Safety service unavailable

English

We cannot safely evaluate your answers right now, so the assessment cannotcontinue. If you feel you may be in immediate danger, contact your localemergency services now and ask a trusted person nearby to stay with you.Otherwise, try again later.

العربية

لا نستطيع تقييم إجاباتك بأمان الآن، لذلك لا يمكن متابعة التقييم. إذا شعرت أنكقد تكون في خطر فوري، فاتصل بخدمات الطوارئ المحلية الآن واطلب من شخص تثق بهوقريب منك أن يبقى معك. بخلاف ذلك، حاول مرة أخرى لاحقًا.

8. Emergency Resources and Location

No hotline number, provider, or emergency contact is shown unless it existsin an approved, versioned resource registry.

MVP fallback is the generic direction to the user's local emergency servicesand a trusted nearby person.

The system MUST NOT infer precise location from assessment content.

If the user voluntarily selects a country, only a currently approved resourcefor that country may be shown.

Missing, expired, or unverified resource data falls back to the generic copy.

The fallback copy MUST never display an invented number.

9. SAFETY_HOLD Re-entry

SAFETY_HOLD is a product state, not a claim that a crisis continues or ended.

Re-entry is initiated by the user after a later sign-in.

The safety message is shown before any resume action.

The required safety check is asked again.

A current CRISIS response repeats crisis routing.

A current HIGH_RISK response repeats high-risk routing.

A current NORMAL or DISTRESS response permits the suspended assessment toresume.

Completion still requires all answers and a final safety evaluation.

Historical safety answers are not edited or relabeled.

10. Failure and Precedence Rules

Any evaluation error fails closed.

No result or onboarding completion is allowed while evaluation is unavailable.

Conflicting signals resolve to the highest risk level.

Client-side state cannot override server-side safety state.

A stale or duplicated request cannot downgrade an existing classification.

Safety copy is displayed without generative rewriting.

Safety events and sensitive answers MUST NOT appear in analytics, logs, traces,crash reports, or notifications.

11. Accessibility and Localization

Arabic and English behavior must be equivalent.

Safety messages receive immediate focus and are announced to assistivetechnology.

The primary emergency action is visually and semantically clear.

Color is not the only indicator of risk or action.

Language switching must not clear the safety state or answers.

Safety-critical missing translations use the approved bilingual fallback andblock normal continuation.

12. Required Validation Fixtures

Tests MUST cover:

S0 → no direct safety escalation.

S1 + D0 → HIGH_RISK.

S1 + D1 → CRISIS.

S2 → immediate CRISIS.

SX + DX → CRISIS.

SQ-03=F2 (with no SQ-01/SQ-02 trigger) → DISTRESS.

SQ-03=F0, F1, or FX → no direct safety escalation from SQ-03 alone.

SQ-03 never downgrades HIGH_RISK or CRISIS (e.g., SQ-01=S2 with SQ-03=F2 → CRISIS, not DISTRESS).

Distress threshold boundaries.

Highest-risk-wins behavior.

Evaluation after every answer and on submission.

Safety-service failure blocks result and completion.

Duplicate/stale requests cannot downgrade safety.

Equivalent Arabic and English routing.

No generative AI invocation.

No unapproved phone number or resource appears.

13. Approval Gate

This matrix resolves feature-planning behavior. Public launch remains blockeduntil a qualified safety reviewer approves:

The direct-question wording.

The classification and re-entry rules.

The bilingual deterministic copy.

The emergency-resource governance process.

