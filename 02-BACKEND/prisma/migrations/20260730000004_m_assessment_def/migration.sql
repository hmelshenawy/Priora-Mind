-- m_assessment_def: Assessment-owned versioned definition reference (US4,
-- data-model §12, research D5). Source: Assessment_Specification v1.0.
-- Immutable once published; a new version is a new row. `content` holds the full
-- definition as JSONB (questions, scale, goals, bands, formula version). The
-- application uses the typed constant ASSESSMENT_DEFINITION_V1
-- (src/modules/assessment/assessment-definition.ts) as the behavioral source of
-- truth for scoring + validation + the definition endpoint; this row is the
-- immutable audit/version record. Keep `content` in sync with that constant.
-- 16 current-state questions across 8 domains (P/N polarity), AG-01..AG-05 goal
-- questions, 0–4 scale, four coaching bands. Safety questions (SQ-01..SQ-03) are
-- unscored and live in the Safety module's SafetyDefinition (US6, m_safety_def).

CREATE TABLE "AssessmentDefinition" (
    "id"          TEXT         NOT NULL,
    "version"     TEXT         NOT NULL,
    "isActive"    BOOLEAN      NOT NULL DEFAULT TRUE,
    "content"     JSONB        NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssessmentDefinition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssessmentDefinition_version_key" ON "AssessmentDefinition" ("version");

INSERT INTO "AssessmentDefinition" ("id", "version", "isActive", "content", "publishedAt")
SELECT 'assessment-definition-v1', 'assessment-1.0', TRUE,
       jsonb_build_object(
         'version', 'assessment-1.0',
         'scoring_formula_version', 'polarity-mean-v1',
         'scale_labels_en', '["Never","Rarely","Sometimes","Often","Always"]'::jsonb,
         'scale_labels_ar', '["أبدًا","نادرًا","أحيانًا","غالبًا","دائمًا"]'::jsonb,
         'current_state_instruction_en', 'During the past two weeks, how often has each statement been true for you?',
         'current_state_instruction_ar', 'خلال الأسبوعين الماضيين، كم مرة كان كل تعبير من التعبيرات التالية صادقًا بالنسبة لك؟',
         'domain_order', '["stress","mood","energy","sleep","focus","confidence","relationships","balance"]'::jsonb,
         'current_state_questions', '[
           {"id":"AS-01","domain":"stress","polarity":"P","en":"I felt able to handle the pressures of my day.","ar":"شعرت أنني قادر على التعامل مع ضغوط يومي."},
           {"id":"AS-02","domain":"mood","polarity":"N","en":"Difficult feelings affected most of my day.","ar":"أثّرت المشاعر الصعبة في معظم يومي."},
           {"id":"AS-03","domain":"energy","polarity":"P","en":"I had enough energy to do the things that mattered to me.","ar":"كانت لدي طاقة كافية للقيام بالأشياء المهمة بالنسبة لي."},
           {"id":"AS-04","domain":"sleep","polarity":"N","en":"Poor or unsettled sleep affected my day.","ar":"أثّر النوم غير المريح أو المتقطع في يومي."},
           {"id":"AS-05","domain":"focus","polarity":"P","en":"I could focus and organize my thoughts when I needed to.","ar":"استطعت التركيز وتنظيم أفكاري عندما احتجت إلى ذلك."},
           {"id":"AS-06","domain":"confidence","polarity":"N","en":"Self-doubt stopped me from taking useful action.","ar":"منعني الشك في نفسي من اتخاذ خطوات مفيدة."},
           {"id":"AS-07","domain":"relationships","polarity":"P","en":"I felt supported or able to reach out to someone I trust.","ar":"شعرت بوجود دعم أو بقدرتي على التواصل مع شخص أثق به."},
           {"id":"AS-08","domain":"balance","polarity":"N","en":"My responsibilities felt disorganized or out of balance.","ar":"شعرت أن مسؤولياتي غير منظمة أو أن حياتي غير متوازنة."},
           {"id":"AS-09","domain":"stress","polarity":"N","en":"The pressures I faced felt greater than my ability to manage them.","ar":"شعرت أن الضغوط التي أواجهها أكبر من قدرتي على إدارتها."},
           {"id":"AS-10","domain":"mood","polarity":"P","en":"I experienced moments of calm, enjoyment, or emotional balance.","ar":"عشت لحظات من الهدوء أو الاستمتاع أو التوازن النفسي."},
           {"id":"AS-11","domain":"energy","polarity":"N","en":"Low energy or motivation made it hard to begin important tasks.","ar":"جعل انخفاض الطاقة أو الدافعية بدء المهام المهمة أمرًا صعبًا."},
           {"id":"AS-12","domain":"sleep","polarity":"P","en":"My sleep gave me enough rest for the following day.","ar":"منحني نومي قدرًا كافيًا من الراحة لليوم التالي."},
           {"id":"AS-13","domain":"focus","polarity":"N","en":"Distraction or racing thoughts made everyday tasks difficult.","ar":"جعل التشتت أو تسارع الأفكار أداء المهام اليومية صعبًا."},
           {"id":"AS-14","domain":"confidence","polarity":"P","en":"I trusted my ability to make decisions and handle challenges.","ar":"وثقت بقدرتي على اتخاذ القرارات والتعامل مع التحديات."},
           {"id":"AS-15","domain":"relationships","polarity":"N","en":"I felt disconnected from people whose support matters to me.","ar":"شعرت بالانفصال عن أشخاص يهمني دعمهم."},
           {"id":"AS-16","domain":"balance","polarity":"P","en":"I was able to balance my main responsibilities and personal needs.","ar":"استطعت الموازنة بين مسؤولياتي الأساسية واحتياجاتي الشخصية."}
         ]'::jsonb,
         'goal_questions', '[
           {"id":"AG-01","kind":"goal_select","required":true,"prompt_en":"Select one to three areas you want to improve.","prompt_ar":"اختر من منطقة إلى ثلاث مناطق تود تحسينها."},
           {"id":"AG-02","kind":"goal_rank","required":true,"prompt_en":"Arrange the selected areas from most to least important to you now.","prompt_ar":"رتّب المناطق المحددة من الأكثر إلى الأقل أهمية بالنسبة لك الآن."},
           {"id":"AG-03","kind":"goal_free_text","required":true,"prompt_en":"What change would you like to achieve in each selected area?","prompt_ar":"ما التغيير الذي ترغب في تحقيقه في كل منطقة محددة؟"},
           {"id":"AG-04","kind":"goal_free_text","required":false,"prompt_en":"Why is this change important to you?","prompt_ar":"لماذا هذا التغيير مهم بالنسبة لك؟"},
           {"id":"AG-05","kind":"goal_free_text","required":false,"prompt_en":"What is the biggest obstacle you expect?","prompt_ar":"ما أكبر عائق تتوقعه؟"}
         ]'::jsonb,
         'band_thresholds', '[
           {"min":75,"max":100,"label_en":"Current strength","label_ar":"نقطة قوة حالية"},
           {"min":50,"max":74,"label_en":"Relatively steady","label_ar":"مستقر نسبيًا"},
           {"min":25,"max":49,"label_en":"Needs attention","label_ar":"يحتاج إلى اهتمام"},
           {"min":0,"max":24,"label_en":"Needs near-term support","label_ar":"يحتاج إلى دعم قريب"}
         ]'::jsonb
       ),
       CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "AssessmentDefinition" WHERE "version" = 'assessment-1.0');