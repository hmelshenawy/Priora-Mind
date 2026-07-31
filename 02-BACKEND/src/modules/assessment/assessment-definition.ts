/**
 * Assessment definition v1.0 — the single typed source of truth for the initial
 * assessment (Assessment_Specification v1.0, data-model §12, research D5).
 *
 * Used by:
 *  - the seed (prisma/seed/assessment-definition.ts) written into the
 *    `AssessmentDefinition` reference row, and
 *  - the pure `ScoringService` (it consumes only the polarity + domain map, so
 *    unit tests need no DB), and
 *  - the lifecycle/submit services for answer validation + completeness.
 *
 * Content is approved-for-planning from Assessment_Specification v1.0. Suggested
 * goal options (AG-03/AG-05) are NOT specified by the spec and are therefore
 * launch-gated: AG-03 requires a free-text desired change per selected domain
 * (the "Other goal" path) until approved suggested goals exist. No clinical
 * content is invented. AR + EN have equal meaning (Constitution X).
 */

export const ASSESSMENT_DEFINITION_VERSION = 'assessment-1.0';
export const SCORING_FORMULA_VERSION = 'polarity-mean-v1';

export type DomainCode =
  | 'stress'
  | 'mood'
  | 'energy'
  | 'sleep'
  | 'focus'
  | 'confidence'
  | 'relationships'
  | 'balance';

export type Polarity = 'P' | 'N';
export type QuestionKind =
  | 'current_state'
  | 'goal_select'
  | 'goal_rank'
  | 'goal_free_text'
  | 'safety';

/** Fixed presentation order of the eight domains (Assessment §5/§9 tie-break). */
export const DOMAIN_ORDER: readonly DomainCode[] = [
  'stress',
  'mood',
  'energy',
  'sleep',
  'focus',
  'confidence',
  'relationships',
  'balance',
];

export const DOMAIN_LABELS_EN: Record<DomainCode, string> = {
  stress: 'Stress management',
  mood: 'Mood',
  energy: 'Energy and motivation',
  sleep: 'Sleep and rest',
  focus: 'Focus and thought organization',
  confidence: 'Self-confidence',
  relationships: 'Relationships and support',
  balance: 'Life balance and organization',
};

export const DOMAIN_LABELS_AR: Record<DomainCode, string> = {
  stress: 'إدارة الضغوط',
  mood: 'المزاج',
  energy: 'الطاقة والدافعية',
  sleep: 'النوم والراحة',
  focus: 'التركيز وتنظيم الأفكار',
  confidence: 'الثقة بالنفس',
  relationships: 'العلاقات والدعم',
  balance: 'التوازن والتنظيم في الحياة',
};

export interface CurrentStateQuestion {
  id: string;
  domain: DomainCode;
  polarity: Polarity;
  en: string;
  ar: string;
}

/** The 16 current-state questions, in the approved order (Assessment §5). */
export const CURRENT_STATE_QUESTIONS: readonly CurrentStateQuestion[] = [
  { id: 'AS-01', domain: 'stress', polarity: 'P', en: 'I felt able to handle the pressures of my day.', ar: 'شعرت أنني قادر على التعامل مع ضغوط يومي.' },
  { id: 'AS-02', domain: 'mood', polarity: 'N', en: 'Difficult feelings affected most of my day.', ar: 'أثّرت المشاعر الصعبة في معظم يومي.' },
  { id: 'AS-03', domain: 'energy', polarity: 'P', en: 'I had enough energy to do the things that mattered to me.', ar: 'كانت لدي طاقة كافية للقيام بالأشياء المهمة بالنسبة لي.' },
  { id: 'AS-04', domain: 'sleep', polarity: 'N', en: 'Poor or unsettled sleep affected my day.', ar: 'أثّر النوم غير المريح أو المتقطع في يومي.' },
  { id: 'AS-05', domain: 'focus', polarity: 'P', en: 'I could focus and organize my thoughts when I needed to.', ar: 'استطعت التركيز وتنظيم أفكاري عندما احتجت إلى ذلك.' },
  { id: 'AS-06', domain: 'confidence', polarity: 'N', en: 'Self-doubt stopped me from taking useful action.', ar: 'منعني الشك في نفسي من اتخاذ خطوات مفيدة.' },
  { id: 'AS-07', domain: 'relationships', polarity: 'P', en: 'I felt supported or able to reach out to someone I trust.', ar: 'شعرت بوجود دعم أو بقدرتي على التواصل مع شخص أثق به.' },
  { id: 'AS-08', domain: 'balance', polarity: 'N', en: 'My responsibilities felt disorganized or out of balance.', ar: 'شعرت أن مسؤولياتي غير منظمة أو أن حياتي غير متوازنة.' },
  { id: 'AS-09', domain: 'stress', polarity: 'N', en: 'The pressures I faced felt greater than my ability to manage them.', ar: 'شعرت أن الضغوط التي أواجهها أكبر من قدرتي على إدارتها.' },
  { id: 'AS-10', domain: 'mood', polarity: 'P', en: 'I experienced moments of calm, enjoyment, or emotional balance.', ar: 'عشت لحظات من الهدوء أو الاستمتاع أو التوازن النفسي.' },
  { id: 'AS-11', domain: 'energy', polarity: 'N', en: 'Low energy or motivation made it hard to begin important tasks.', ar: 'جعل انخفاض الطاقة أو الدافعية بدء المهام المهمة أمرًا صعبًا.' },
  { id: 'AS-12', domain: 'sleep', polarity: 'P', en: 'My sleep gave me enough rest for the following day.', ar: 'منحني نومي قدرًا كافيًا من الراحة لليوم التالي.' },
  { id: 'AS-13', domain: 'focus', polarity: 'N', en: 'Distraction or racing thoughts made everyday tasks difficult.', ar: 'جعل التشتت أو تسارع الأفكار أداء المهام اليومية صعبًا.' },
  { id: 'AS-14', domain: 'confidence', polarity: 'P', en: 'I trusted my ability to make decisions and handle challenges.', ar: 'وثقت بقدرتي على اتخاذ القرارات والتعامل مع التحديات.' },
  { id: 'AS-15', domain: 'relationships', polarity: 'N', en: 'I felt disconnected from people whose support matters to me.', ar: 'شعرت بالانفصال عن أشخاص يهمني دعمهم.' },
  { id: 'AS-16', domain: 'balance', polarity: 'P', en: 'I was able to balance my main responsibilities and personal needs.', ar: 'استطعت الموازنة بين مسؤولياتي الأساسية واحتياجاتي الشخصية.' },
];

/** The 0–4 current-state answer scale (Assessment §4). */
export const SCALE_LABELS_EN = ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'] as const;
export const SCALE_LABELS_AR = ['أبدًا', 'نادرًا', 'أحيانًا', 'غالبًا', 'دائمًا'] as const;

export const CURRENT_STATE_INSTRUCTION_EN =
  'During the past two weeks, how often has each statement been true for you?';
export const CURRENT_STATE_INSTRUCTION_AR =
  'خلال الأسبوعين الماضيين، كم مرة كان كل تعبير من التعبيرات التالية صادقًا بالنسبة لك؟';

/** Result bands (Assessment §8) — coaching labels, NOT safety levels (FR-018). */
export interface BandThreshold {
  min: number;
  max: number;
  label_en: string;
  label_ar: string;
}
export const BAND_THRESHOLDS: readonly BandThreshold[] = [
  { min: 75, max: 100, label_en: 'Current strength', label_ar: 'نقطة قوة حالية' },
  { min: 50, max: 74, label_en: 'Relatively steady', label_ar: 'مستقر نسبيًا' },
  { min: 25, max: 49, label_en: 'Needs attention', label_ar: 'يحتاج إلى اهتمام' },
  { min: 0, max: 24, label_en: 'Needs near-term support', label_ar: 'يحتاج إلى دعم قريب' },
];

/** Goal + priority questions (Assessment §6). AG-04/05 optional; the rest required. */
export interface GoalQuestion {
  id: 'AG-01' | 'AG-02' | 'AG-03' | 'AG-04' | 'AG-05';
  kind: QuestionKind;
  required: boolean;
  prompt_en: string;
  prompt_ar: string;
}
export const GOAL_QUESTIONS: readonly GoalQuestion[] = [
  { id: 'AG-01', kind: 'goal_select', required: true, prompt_en: 'Select one to three areas you want to improve.', prompt_ar: 'اختر من منطقة إلى ثلاث مناطق تود تحسينها.' },
  { id: 'AG-02', kind: 'goal_rank', required: true, prompt_en: 'Arrange the selected areas from most to least important to you now.', prompt_ar: 'رتّب المناطق المحددة من الأكثر إلى الأقل أهمية بالنسبة لك الآن.' },
  { id: 'AG-03', kind: 'goal_free_text', required: true, prompt_en: 'What change would you like to achieve in each selected area?', prompt_ar: 'ما التغيير الذي ترغب في تحقيقه في كل منطقة محددة؟' },
  { id: 'AG-04', kind: 'goal_free_text', required: false, prompt_en: 'Why is this change important to you?', prompt_ar: 'لماذا هذا التغيير مهم بالنسبة لك؟' },
  { id: 'AG-05', kind: 'goal_free_text', required: false, prompt_en: 'What is the biggest obstacle you expect?', prompt_ar: 'ما أكبر عائق تتوقعه؟' },
];

/** All coaching question ids in presentation order (current-state, then goals). */
export const COACHING_QUESTION_IDS: readonly string[] = [
  ...CURRENT_STATE_QUESTIONS.map((q) => q.id),
  ...GOAL_QUESTIONS.map((q) => q.id),
];

/** Required coaching question ids (FR-014a, Assessment §10). */
export const REQUIRED_COACHING_IDS: readonly string[] = [
  ...CURRENT_STATE_QUESTIONS.map((q) => q.id),
  'AG-01',
  'AG-02',
  'AG-03',
];

/** Polarity + domain lookup keyed by current-state question id (ScoringService input). */
export const CURRENT_STATE_MAP: Readonly<Record<string, { domain: DomainCode; polarity: Polarity }>> =
  Object.fromEntries(
    CURRENT_STATE_QUESTIONS.map((q) => [q.id, { domain: q.domain, polarity: q.polarity }]),
  );

/** The two current-state question ids per domain (in definition order). */
export const DOMAIN_QUESTION_IDS: Readonly<Record<DomainCode, [string, string]>> = {
  stress: ['AS-01', 'AS-09'],
  mood: ['AS-02', 'AS-10'],
  energy: ['AS-03', 'AS-11'],
  sleep: ['AS-04', 'AS-12'],
  focus: ['AS-05', 'AS-13'],
  confidence: ['AS-06', 'AS-14'],
  relationships: ['AS-07', 'AS-15'],
  balance: ['AS-08', 'AS-16'],
};

/** Full serializable definition (stored as the `AssessmentDefinition.content` row). */
export interface AssessmentDefinitionContent {
  version: string;
  scoring_formula_version: string;
  scale_labels_en: readonly string[];
  scale_labels_ar: readonly string[];
  current_state_instruction_en: string;
  current_state_instruction_ar: string;
  current_state_questions: readonly CurrentStateQuestion[];
  goal_questions: readonly GoalQuestion[];
  band_thresholds: readonly BandThreshold[];
  domain_order: readonly DomainCode[];
  domain_labels_en: Record<DomainCode, string>;
  domain_labels_ar: Record<DomainCode, string>;
}

export const ASSESSMENT_DEFINITION_V1: AssessmentDefinitionContent = {
  version: ASSESSMENT_DEFINITION_VERSION,
  scoring_formula_version: SCORING_FORMULA_VERSION,
  scale_labels_en: SCALE_LABELS_EN,
  scale_labels_ar: SCALE_LABELS_AR,
  current_state_instruction_en: CURRENT_STATE_INSTRUCTION_EN,
  current_state_instruction_ar: CURRENT_STATE_INSTRUCTION_AR,
  current_state_questions: CURRENT_STATE_QUESTIONS,
  goal_questions: GOAL_QUESTIONS,
  band_thresholds: BAND_THRESHOLDS,
  domain_order: DOMAIN_ORDER,
  domain_labels_en: DOMAIN_LABELS_EN,
  domain_labels_ar: DOMAIN_LABELS_AR,
};