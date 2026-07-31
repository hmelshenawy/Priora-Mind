-- m_safety_def: Safety-owned versioned reference rows (US6, data-model §12,
-- research D5). Source: Safety_Decision_Matrix v1.0.
--  - SafetyDefinition: the three unscored safety questions (SQ-01/02/03) + option
--    codes + classification matrix version, stored as immutable JSONB. The
--    application uses the typed constant SAFETY_QUESTIONS
--    (src/modules/safety/safety-definition.ts) as the behavioral source of truth
--    for classification + the definition endpoint; this row is the immutable
--    audit/version record. Keep `content` in sync with that constant.
--  - SafetyCopy: the approved deterministic bilingual copy (DISTRESS/HIGH_RISK/
--    CRISIS/unavailable — Safety Matrix §7). The application reads SAFETY_COPY as
--    the behavioral source of truth; these rows are the immutable audit record.
--    Copy is NEVER generatively rewritten (FR-020/FR-021).
--  - EmergencyResource: approved, versioned emergency resources (Safety Matrix §8,
--    FR-024). EMPTY for MVP — no hotline number, provider, or contact is invented
--    (Safety §13 launch gate). The application uses APPROVED_RESOURCES (empty) as the
--    behavioral source of truth; this table is the governance record for future
--    approved resources.
-- Safety classification is SEPARATE from assessment scoring (FR-019); the three
-- safety questions are unscored. SQ-03 classifies DISTRESS only and never downgrades
-- HIGH_RISK/CRISIS (Safety §5, highest-risk-wins).

CREATE TABLE "SafetyDefinition" (
    "id"          TEXT         NOT NULL,
    "version"     TEXT         NOT NULL,
    "isActive"    BOOLEAN      NOT NULL DEFAULT TRUE,
    "content"     JSONB        NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SafetyDefinition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SafetyDefinition_version_key" ON "SafetyDefinition" ("version");

CREATE TABLE "SafetyCopy" (
    "id"          TEXT         NOT NULL,
    "version"     TEXT         NOT NULL,
    "level"       TEXT         NOT NULL,
    "copyEn"      TEXT         NOT NULL,
    "copyAr"      TEXT         NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SafetyCopy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SafetyCopy_version_level_key" ON "SafetyCopy" ("version", "level");

CREATE TABLE "EmergencyResource" (
    "id"          TEXT         NOT NULL,
    "version"     TEXT         NOT NULL,
    "countryCode" TEXT,
    "resourceEn"  TEXT         NOT NULL,
    "resourceAr"  TEXT         NOT NULL,
    "approved"    BOOLEAN      NOT NULL DEFAULT FALSE,
    "approvedAt"  TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmergencyResource_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmergencyResource_version_approved_idx" ON "EmergencyResource" ("version", "approved");

-- Seed SafetyDefinition v1.0 (content mirrors src/modules/safety/safety-definition.ts).
INSERT INTO "SafetyDefinition" ("id", "version", "isActive", "content") VALUES
  ('safety-definition-v1', 'safety-1.0', TRUE,
   jsonb_build_object(
     'version', 'safety-1.0',
     'matrix_version', 'safety-matrix-1.0',
     'sq_questions', '[
       {"id":"SQ-01","required":true,"shownWhen":null,
        "prompt_en":"During the past two weeks, have you had thoughts of harming yourself or that you would be better off not being alive?",
        "prompt_ar":"خلال الأسبوعين الماضيين، هل راودتك أفكار بإيذاء نفسك أو بأنك ستكون أفضل لو لم تكن على قيد الحياة؟",
        "options":[
          {"code":"S0","en":"No","ar":"لا"},
          {"code":"S1","en":"Yes, but not now","ar":"نعم، ولكن ليس الآن"},
          {"code":"S2","en":"Yes, including now","ar":"نعم، بما في ذلك الآن"},
          {"code":"SX","en":"Prefer not to answer","ar":"أفضل عدم الإجابة"}]},
       {"id":"SQ-02","required":true,"shownWhen":["S1","S2","SX"],
        "prompt_en":"Are you in immediate danger now, or do you believe you may act on these thoughts soon?",
        "prompt_ar":"هل أنت في خطر فوري الآن، أو تعتقد أنك قد تتصرف بناءً على هذه الأفكار قريبًا؟",
        "options":[
          {"code":"D0","en":"No","ar":"لا"},
          {"code":"D1","en":"Yes or I am not sure","ar":"نعم أو لست متأكدًا"},
          {"code":"DX","en":"Prefer not to answer","ar":"أفضل عدم الإجابة"}]},
       {"id":"SQ-03","required":true,"shownWhen":null,
        "prompt_en":"Over the past two weeks, has emotional distress made it hard for you to function in your daily life?",
        "prompt_ar":"خلال الأسبوعين الماضيين، هل جعل الضيق النفسي أداء مهام حياتك اليومية أمرًا صعبًا عليك؟",
        "options":[
          {"code":"F0","en":"No","ar":"لا"},
          {"code":"F1","en":"Some days","ar":"بعض الأيام"},
          {"code":"F2","en":"Most days","ar":"معظم الأيام"},
          {"code":"FX","en":"Prefer not to answer","ar":"أفضل عدم الإجابة"}]}
        ]'::jsonb,
     'distress_threshold', 25,
     'distress_min_domains', 3,
     'mood_domain', 'mood'
   ));

-- Seed SafetyCopy v1.0 (Safety Matrix §7 — exact approved deterministic copy).
INSERT INTO "SafetyCopy" ("id", "version", "level", "copyEn", "copyAr") VALUES
  ('safety-copy-distress-v1', 'safety-1.0', 'DISTRESS',
   'Your answers suggest that several areas may feel difficult right now. This is not a diagnosis. You can continue, and you may also consider speaking with a qualified professional if these difficulties persist, worsen, or interfere with daily life.',
   'تشير إجاباتك إلى أن عدة جوانب قد تكون صعبة عليك حاليًا. هذه ليست نتيجة تشخيصية. يمكنك الاستمرار، وقد يكون من المفيد أيضًا التحدث مع مختص مؤهل إذا استمرت هذه الصعوبات أو ازدادت أو أثرت في حياتك اليومية.'),
  ('safety-copy-high-risk-v1', 'safety-1.0', 'HIGH_RISK',
   'Thank you for telling us. Your safety matters more than continuing this assessment. Priora Mind is not an emergency or clinical service. Please seek prompt support from a qualified professional and tell someone you trust who can support you. If you begin to feel in immediate danger, contact your local emergency services now.',
   'شكرًا لأنك أخبرتنا. سلامتك أهم من استكمال هذا التقييم. Priora Mind ليست خدمة طوارئ أو خدمة علاجية. يُرجى طلب دعم عاجل من مختص مؤهل، وإخبار شخص تثق به ويمكنه دعمك. إذا شعرت أنك أصبحت في خطر فوري، فاتصل بخدمات الطوارئ المحلية الآن.'),
  ('safety-copy-crisis-v1', 'safety-1.0', 'CRISIS',
   'Your answers indicate that you may be in immediate danger. Priora Mind cannot provide emergency help. Contact your local emergency services now, and if possible move to a safer place and ask a trusted person nearby to stay with you. Do not remain alone while you may be in immediate danger.',
   'تشير إجاباتك إلى أنك قد تكون في خطر فوري. لا تستطيع Priora Mind تقديم مساعدة طارئة. اتصل بخدمات الطوارئ المحلية الآن، وانتقل إن أمكن إلى مكان أكثر أمانًا واطلب من شخص تثق به وقريب منك أن يبقى معك. لا تبق وحدك ما دمت قد تكون في خطر فوري.'),
  ('safety-copy-unavailable-v1', 'safety-1.0', 'UNAVAILABLE',
   'We cannot safely evaluate your answers right now, so the assessment cannot continue. If you feel you may be in immediate danger, contact your local emergency services now and ask a trusted person nearby to stay with you. Otherwise, try again later.',
   'لا نستطيع تقييم إجاباتك بأمان الآن، لذلك لا يمكن متابعة التقييم. إذا شعرت أنك قد تكون في خطر فوري، فاتصل بخدمات الطوارئ المحلية الآن واطلب من شخص تثق به وقريب منك أن يبقى معك. بخلاف ذلك، حاول مرة أخرى لاحقًا.');

-- EmergencyResource: intentionally empty for MVP (Safety §8/§13, FR-024).
-- No hotline numbers, providers, or emergency contacts are invented. Approved,
-- versioned rows are added here only after safety-reviewer approval per country.