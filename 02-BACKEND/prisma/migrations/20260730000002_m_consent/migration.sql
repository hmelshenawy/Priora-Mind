-- m_consent: Auth-owned consent + versioned notices (US2, data-model §4/§12).
-- Forward-only. ConsentRecord cascades on user deletion (Consent §8/§9).
-- NoticeVersionSet is reference content (immutable once published; research D5).
-- Seed v1.0: service-boundary text from Consent_and_Data_Retention_Policy §3 (EN+AR
-- verbatim). Terms/Privacy Notice links are launch-gated (Consent §15) → empty
-- placeholders until legal approval. Keep in sync with prisma/seed/notice-versions.ts.

CREATE TABLE "NoticeVersionSet" (
    "id"                     TEXT          NOT NULL,
    "serviceBoundaryVersion" TEXT          NOT NULL,
    "termsVersion"           TEXT          NOT NULL,
    "privacyNoticeVersion"   TEXT          NOT NULL,
    "boundaryTextEn"         TEXT          NOT NULL,
    "boundaryTextAr"         TEXT          NOT NULL,
    "termsLinkEn"            TEXT          NOT NULL,
    "termsLinkAr"            TEXT          NOT NULL,
    "privacyNoticeLinkEn"    TEXT          NOT NULL,
    "privacyNoticeLinkAr"    TEXT          NOT NULL,
    "publishedAt"            TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive"              BOOLEAN       NOT NULL DEFAULT true,
    CONSTRAINT "NoticeVersionSet_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NoticeVersionSet_versions_key"
    ON "NoticeVersionSet" ("serviceBoundaryVersion", "termsVersion", "privacyNoticeVersion");

CREATE TABLE "ConsentRecord" (
    "id"                     TEXT          NOT NULL,
    "userId"                 TEXT          NOT NULL,
    "serviceBoundaryVersion" TEXT          NOT NULL,
    "termsVersion"           TEXT          NOT NULL,
    "privacyNoticeVersion"   TEXT          NOT NULL,
    "consentLanguageCode"    TEXT          NOT NULL,
    "productChannelId"       TEXT          NOT NULL,
    "grantedAt"              TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"              TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConsentRecord_user_versions_key"
    ON "ConsentRecord" ("userId", "serviceBoundaryVersion", "termsVersion", "privacyNoticeVersion");
CREATE INDEX "ConsentRecord_userId_idx" ON "ConsentRecord" ("userId");
ALTER TABLE "ConsentRecord"
    ADD CONSTRAINT "ConsentRecord_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "UserAccount" ("id") ON DELETE CASCADE;

-- Seed v1.0 (idempotent). Boundary text from Consent policy §3.
INSERT INTO "NoticeVersionSet" (
    "id", "serviceBoundaryVersion", "termsVersion", "privacyNoticeVersion",
    "boundaryTextEn", "boundaryTextAr",
    "termsLinkEn", "termsLinkAr", "privacyNoticeLinkEn", "privacyNoticeLinkAr", "isActive"
) VALUES (
    'notice-version-set-v1', 'boundary-1.0', 'terms-1.0', 'privacy-1.0',
    'Priora Mind provides AI-assisted coaching for personal growth and mental wellbeing. It is not medical, psychiatric, psychological, diagnostic, or emergency care, and it does not replace a qualified professional. If you may be in immediate danger, contact your local emergency services and a trusted person nearby. Your assessment answers are used to provide a non-diagnostic coaching result and, in future features, to personalize your coaching experience. Safety checks may interrupt the assessment when your answers indicate that urgent human support may be needed.',
    'تقدم Priora Mind إرشادًا بمساعدة الذكاء الاصطناعي للنمو الشخصي والرفاهية النفسية. وهي ليست خدمة طبية أو نفسية أو تشخيصية أو خدمة طوارئ، ولا تحل محل المختص المؤهل. إذا كنت قد تكون في خطر فوري، فاتصل بخدمات الطوارئ المحلية وبشخص تثق به وقريب منك. تُستخدم إجابات التقييم لتقديم نتيجة إرشادية غير تشخيصية، وفي الخصائص المستقبلية لتخصيص تجربة الإرشاد. وقد تؤدي فحوص الأمان إلى إيقاف التقييم عندما تشير إجاباتك إلى احتمال الحاجة إلى دعم بشري عاجل.',
    '', '', '', '', true
)
ON CONFLICT DO NOTHING;