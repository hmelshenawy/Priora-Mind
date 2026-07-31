/**
 * NoticeVersionSet v1.0 seed content (data-model §12, Consent policy §3/§6).
 *
 * The service-boundary disclosure text is the approved-for-planning wording from
 * Consent_and_Data_Retention_Policy.md §3 (EN + AR verbatim). The Terms and
 * Privacy Notice **links** are launch-gated (Consent §15) and ship as empty
 * placeholders until legal approval — the frontend surfaces a "pending approval"
 * state. Versions are independent immutable identifiers (Consent §6).
 *
 * This module is the single typed source for the v1.0 row used by:
 *  - the in-memory contract/unit tests (seed into InMemoryPrisma), and
 *  - the production seed (the `m_consent` migration mirrors this content inline
 *    as an idempotent INSERT; both are immutable v1.0 reference content).
 *
 * Sensitive: the boundary text is notice copy, not user content; it is safe to
 * log in aggregate (redact.ts keeps `consent`/`copy` out of user-context logs,
 * but this static reference text is not user data).
 */

export interface NoticeVersionSeed {
  id: string;
  serviceBoundaryVersion: string;
  termsVersion: string;
  privacyNoticeVersion: string;
  boundaryTextEn: string;
  boundaryTextAr: string;
  termsLinkEn: string;
  termsLinkAr: string;
  privacyNoticeLinkEn: string;
  privacyNoticeLinkAr: string;
  isActive: boolean;
}

const BOUNDARY_TEXT_EN = `Priora Mind provides AI-assisted coaching for personal growth and mental wellbeing. It is not medical, psychiatric, psychological, diagnostic, or emergency care, and it does not replace a qualified professional. If you may be in immediate danger, contact your local emergency services and a trusted person nearby. Your assessment answers are used to provide a non-diagnostic coaching result and, in future features, to personalize your coaching experience. Safety checks may interrupt the assessment when your answers indicate that urgent human support may be needed.`;

const BOUNDARY_TEXT_AR = `تقدم Priora Mind إرشادًا بمساعدة الذكاء الاصطناعي للنمو الشخصي والرفاهية النفسية. وهي ليست خدمة طبية أو نفسية أو تشخيصية أو خدمة طوارئ، ولا تحل محل المختص المؤهل. إذا كنت قد تكون في خطر فوري، فاتصل بخدمات الطوارئ المحلية وبشخص تثق به وقريب منك. تُستخدم إجابات التقييم لتقديم نتيجة إرشادية غير تشخيصية، وفي الخصائص المستقبلية لتخصيص تجربة الإرشاد. وقد تؤدي فحوص الأمان إلى إيقاف التقييم عندما تشير إجاباتك إلى احتمال الحاجة إلى دعم بشري عاجل.`;

/** The v1.0 notice version set (Consent policy §3). Links pending legal approval. */
export const NOTICE_VERSION_V1: NoticeVersionSeed = {
  id: 'notice-version-set-v1',
  serviceBoundaryVersion: 'boundary-1.0',
  termsVersion: 'terms-1.0',
  privacyNoticeVersion: 'privacy-1.0',
  boundaryTextEn: BOUNDARY_TEXT_EN,
  boundaryTextAr: BOUNDARY_TEXT_AR,
  // Launch-gated (Consent §15): empty until approved Terms/Privacy Notice URLs exist.
  termsLinkEn: '',
  termsLinkAr: '',
  privacyNoticeLinkEn: '',
  privacyNoticeLinkAr: '',
  isActive: true,
};

/** A second version set used by re-consent tests (boundary text unchanged, new terms version). */
export const NOTICE_VERSION_V2_TERMS: NoticeVersionSeed = {
  id: 'notice-version-set-v2-terms',
  serviceBoundaryVersion: 'boundary-1.0',
  termsVersion: 'terms-1.1',
  privacyNoticeVersion: 'privacy-1.0',
  boundaryTextEn: BOUNDARY_TEXT_EN,
  boundaryTextAr: BOUNDARY_TEXT_AR,
  termsLinkEn: '',
  termsLinkAr: '',
  privacyNoticeLinkEn: '',
  privacyNoticeLinkAr: '',
  isActive: true,
};