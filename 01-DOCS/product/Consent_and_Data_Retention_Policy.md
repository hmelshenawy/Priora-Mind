# Priora Mind — Consent and Data Retention Policy

**Version:** 1.0  
**Status:** Product Policy Baseline — Legal Review Required Before Public Launch  
**Owners:** Auth Module (consent); domain owners (data); platform deletion flow  
**Feature:** `001-user-onboarding-and-assessment`  
**Last updated:** 2026-07-29

## 1. Purpose

This document defines the product behavior for informed onboarding consent,
notice versioning, retention, and deletion. It is not legal advice and does not
replace jurisdiction-specific Terms of Service or a Privacy Notice.

## 2. Required Notices

Before profile or assessment data is collected, the user must receive:

1. The Priora Mind service-boundary disclosure.
2. A link to the current Terms of Service.
3. A link to the current Privacy Notice.
4. A clear consent action.

Consent is explicit. Continuing to use the screen, inactivity, or a preselected
checkbox does not constitute consent.

## 3. Approved Service-Boundary Disclosure

### English

> Priora Mind provides AI-assisted coaching for personal growth and mental
> wellbeing. It is not medical, psychiatric, psychological, diagnostic, or
> emergency care, and it does not replace a qualified professional. If you may
> be in immediate danger, contact your local emergency services and a trusted
> person nearby. Your assessment answers are used to provide a non-diagnostic
> coaching result and, in future features, to personalize your coaching
> experience. Safety checks may interrupt the assessment when your answers
> indicate that urgent human support may be needed.

### العربية

> تقدم Priora Mind إرشادًا بمساعدة الذكاء الاصطناعي للنمو الشخصي والرفاهية
> النفسية. وهي ليست خدمة طبية أو نفسية أو تشخيصية أو خدمة طوارئ، ولا تحل محل
> المختص المؤهل. إذا كنت قد تكون في خطر فوري، فاتصل بخدمات الطوارئ المحلية
> وبشخص تثق به وقريب منك. تُستخدم إجابات التقييم لتقديم نتيجة إرشادية غير
> تشخيصية، وفي الخصائص المستقبلية لتخصيص تجربة الإرشاد. وقد تؤدي فحوص الأمان
> إلى إيقاف التقييم عندما تشير إجاباتك إلى احتمال الحاجة إلى دعم بشري عاجل.

## 4. Consent Presentation

The user must separately acknowledge:

- **Required:** I understand the service boundaries.
- **Required:** I agree to the current Terms of Service.
- **Required:** I acknowledge the current Privacy Notice and the described use
  of my assessment data.

The action label is **Agree and continue / أوافق وأتابع**.

If the user declines or leaves any required acknowledgment unchecked:

- Onboarding does not advance.
- No profile, assessment, goal, or safety-answer data is collected.
- The account may remain in its verified, pre-consent state.
- The user may return later and review the notices again.

## 5. Consent Record

The Auth module owns the Consent Record. Each granted record contains:

- User identifier.
- Service-boundary disclosure version.
- Terms version.
- Privacy Notice version.
- Consent-language code.
- Granted timestamp.
- Product/channel identifier.

The record MUST NOT contain assessment answers, safety answers, inferred mental
state, or copied notice text.

## 6. Versioning and Re-consent

Versions use independent immutable identifiers:

- `service_boundary_version`
- `terms_version`
- `privacy_notice_version`

A new consent record is required when:

- Terms or Privacy Notice content changes materially.
- Data purposes or sharing practices change.
- The service boundary changes.
- A regulator or approved legal owner requires renewed consent.

Spelling, layout, or translation corrections that preserve meaning may keep the
same semantic version but must remain auditable through document history.

When re-consent is required:

- Access to protected coaching features is paused.
- The updated text and a concise change summary are shown.
- Existing data is not used for a newly introduced purpose before consent.
- Declining does not silently grant consent or delete data; the user is directed
  to account/data controls.

## 7. Data Categories and Purpose

| Data | Purpose | Owner |
|---|---|---|
| Account and verification data | Secure account access | Auth |
| Consent Record | Prove the accepted notice versions | Auth |
| Language and timezone | Localized experience and time handling | Profile |
| Onboarding State | Resume and route onboarding | Profile |
| Assessment answers | Score the initial coaching assessment | Assessment |
| Goal and priority answers | Prepare future coaching-plan input | Assessment |
| Assessment result | Present the non-diagnostic result and support future planning | Assessment |
| Safety answers/evaluation | Apply required safety routing | Safety |

Data MUST NOT be repurposed for advertising, sale, or unrelated model training
without an explicit future product decision, updated notices, and any required
consent.

## 8. Retention Schedule

The following MVP retention rules are product limits, subject to legal review:

| Record | Retention rule |
|---|---|
| Unverified account | Delete after 7 days if verification is never completed |
| Verified pre-consent account | Retain until account deletion or 30 days of inactivity, whichever comes first |
| Incomplete onboarding/profile data | Delete after 30 days of onboarding inactivity |
| Incomplete assessment and goal answers | Delete after 30 days of assessment inactivity |
| Completed assessment answers and result | Retain while the account exists, until user/account deletion |
| Safety answers and Safety Evaluation | Retain while the related assessment/account exists, until user/account deletion |
| Superseded Consent Records | Retain while the account exists for audit of accepted versions |
| Operational deletion record | Keep only a non-sensitive confirmation identifier and deletion timestamp for 30 days |
| Logs, traces, analytics, crash reports | Must never contain assessment, goal free text, safety answers, or results |

Inactivity means no authenticated progress or account activity affecting the
relevant onboarding journey during the stated period.

Deletion caused by inactivity returns onboarding to the earliest valid state;
the user is told that expired progress cannot be restored.

## 9. Account and User-Initiated Deletion

Account deletion permanently removes:

- Profile and preferences.
- Onboarding State.
- Active and completed assessment answers.
- Goal and priority answers.
- Assessment results and derived scores.
- Safety answers and Safety Evaluations.
- Consent Records.
- Any cached, indexed, exported, or derived copies owned by Priora Mind.

Deletion MUST:

- Require authenticated confirmation.
- Prevent new processing as soon as the deletion request is accepted.
- Be idempotent.
- Remove derived data, not only primary rows.
- Leave no assessment or safety content in logs or analytics.
- Not claim completion until all in-scope stores confirm deletion.

No legal-retention exception is assumed in the MVP. If a validated legal duty
later requires limited retention, this policy and the Privacy Notice must define
the exact data, purpose, period, access restrictions, and deletion outcome
before implementation.

## 10. User Control and Transparency

The user can:

- View the current service boundary, Terms, and Privacy Notice.
- See the version/date of the notices currently in force.
- Change language without changing consent status.
- Restart an incomplete assessment, which deletes the active saved answers.
- Delete the account and all onboarding/assessment/safety data.

The initial completed result cannot be edited, retaken, or revisited through
feature 001. This limitation must be disclosed before final submission.

## 11. Privacy and Security Requirements

- Data access is limited to the authenticated owner and authorized services.
- Backend authorization, not frontend routing, enforces isolation.
- Sensitive answers are encrypted in transit and protected at rest according to
  the approved security baseline.
- Sensitive content is excluded from logs, metrics, analytics, traces, support
  screenshots, and error payloads.
- No assessment content is stored in browser local storage.
- No user content from this feature is sent to an external AI provider.
- Data exports, if introduced later, must preserve ownership and sensitivity.

## 12. Failure and Recovery

- If required notices cannot load, consent cannot be granted and onboarding
  remains blocked.
- If saving consent fails, the UI must not advance.
- A retry must not create contradictory or duplicate consent records.
- If the current notice version differs from the recorded version, re-consent
  is required before continuing.
- If deletion partially fails, access remains disabled and the deletion process
  retries safely; the user is not told that deletion is complete.
- Expired incomplete data is not recoverable from application backups through
  normal product flows.

## 13. Arabic, English, and Accessibility

- Arabic and English notice meaning must be equivalent.
- Arabic is rendered RTL and English LTR.
- Legal links, consent controls, and validation messages are keyboard accessible
  and correctly labeled for assistive technology.
- Consent checkboxes are never preselected.
- A language switch preserves entered state but requires the user to see the
  consent statements in the selected language before submission.
- Material translation ambiguity blocks approval of that notice version.

## 14. Validation Checklist

Before implementation planning is accepted, verify that:

- Consent is required before collecting profile or assessment data.
- Decline does not advance onboarding.
- Consent stores all required version identifiers and language.
- A material version change requires re-consent.
- Assessment and safety data never appear in telemetry.
- Incomplete data expires at the defined boundaries.
- Account deletion covers primary, derived, cached, and indexed copies.
- Duplicate consent and deletion requests are idempotent.
- Arabic and English flows have equivalent behavior.
- No AI provider receives this feature's user data.

## 15. Approval Gate

This document resolves the product behavior needed for feature planning.
Public launch remains blocked until approved legal/privacy reviewers validate:

- Final Terms of Service and Privacy Notice.
- The service-boundary and consent wording.
- The retention periods in every launch jurisdiction.
- Any age, residency, or parental-consent restrictions.
- The operational deletion and backup-erasure commitments.

