/**
 * Safety definition v1.0 — the single typed source of truth for deterministic
 * safety classification (Safety_Decision_Matrix v1.0, data-model §12, research D5/D8).
 *
 * Used by:
 *  - the pure `safety-classifier.ts` (it consumes only the SQ option codes + the
 *    distress-pattern rule, so unit tests need no DB), and
 *  - the `SafetyService` (copy/resource/action resolution), and
 *  - the seed (prisma/seed/safety-definition.ts) written into the SafetyDefinition /
 *    SafetyCopy reference rows, and
 *  - the Assessment lifecycle `getDefinition` (safety_questions in the definition
 *    endpoint) and answer schemas (SQ-01/02/03 validation).
 *
 * Content is the approved-for-planning deterministic copy + matrix from
 * Safety_Decision_Matrix v1.0. The direct-question wording MUST NOT be softened in
 * a way that changes meaning (Safety §3). No hotline numbers, provider names, or
 * emergency contacts are invented (FR-024): APPROVED_RESOURCES is empty until a
 * versioned, approved resource registry exists (Safety §8/§13 launch gate). The
 * copy directs the user to local emergency services / a trusted nearby person as
 * the generic fallback. AR + EN have equal meaning (Constitution X, Safety §11).
 *
 * INVARIANT (Safety §2/§5, FR-019): safety classification is SEPARATE from assessment
 * scoring. SQ-01/SQ-02 determine HIGH_RISK/CRISIS; SQ-03 classifies DISTRESS ONLY and
 * MUST NOT produce HIGH_RISK/CRISIS or downgrade a HIGH_RISK/CRISIS classification
 * from SQ-01/SQ-02 (highest-risk-wins). All three safety questions are UNSCORED and
 * never feed domain scores.
 */

export const SAFETY_DEFINITION_VERSION = 'safety-1.0';
export const SAFETY_MATRIX_VERSION = 'safety-matrix-1.0';

export type SafetyLevel = 'NORMAL' | 'DISTRESS' | 'HIGH_RISK' | 'CRISIS';
export type TriggerContext = 'per_answer' | 'on_submit' | 're_entry';

/** SQ-01 answer codes (recent self-harm thoughts, Safety §3). */
export type Sq01Code = 'S0' | 'S1' | 'S2' | 'SX';
/** SQ-02 answer codes (immediate danger, shown only when SQ-01 ∈ {S1,S2,SX}). */
export type Sq02Code = 'D0' | 'D1' | 'DX';
/** SQ-03 answer codes (current functional distress — DISTRESS only, Safety §3/§5). */
export type Sq03Code = 'F0' | 'F1' | 'F2' | 'FX';

export interface BilingualEntry {
  en: string;
  ar: string;
}

export interface SafetyOption {
  code: string;
  en: string;
  ar: string;
}

export interface SafetyQuestion {
  id: 'SQ-01' | 'SQ-02' | 'SQ-03';
  /** SQ-02 is shown only when SQ-01 ∈ {S1, S2, SX} (Safety §3). null = always shown. */
  shownWhen?: readonly Sq01Code[];
  required: boolean;
  prompt_en: string;
  prompt_ar: string;
  options: readonly SafetyOption[];
}

/** The three unscored safety questions, in order (Safety §3). */
export const SAFETY_QUESTIONS: readonly SafetyQuestion[] = [
  {
    id: 'SQ-01',
    required: true,
    prompt_en:
      'During the past two weeks, have you had thoughts of harming yourself or that you would be better off not being alive?',
    prompt_ar:
      'خلال الأسبوعين الماضيين، هل راودتك أفكار بإيذاء نفسك أو بأنك ستكون أفضل لو لم تكن على قيد الحياة؟',
    options: [
      { code: 'S0', en: 'No', ar: 'لا' },
      { code: 'S1', en: 'Yes, but not now', ar: 'نعم، ولكن ليس الآن' },
      { code: 'S2', en: 'Yes, including now', ar: 'نعم، بما في ذلك الآن' },
      { code: 'SX', en: 'Prefer not to answer', ar: 'أفضل عدم الإجابة' },
    ],
  },
  {
    id: 'SQ-02',
    shownWhen: ['S1', 'S2', 'SX'],
    required: true, // conditionally required: enforced via the lifecycle cross-check
    prompt_en:
      'Are you in immediate danger now, or do you believe you may act on these thoughts soon?',
    prompt_ar:
      'هل أنت في خطر فوري الآن، أو تعتقد أنك قد تتصرف بناءً على هذه الأفكار قريبًا؟',
    options: [
      { code: 'D0', en: 'No', ar: 'لا' },
      { code: 'D1', en: 'Yes or I am not sure', ar: 'نعم أو لست متأكدًا' },
      { code: 'DX', en: 'Prefer not to answer', ar: 'أفضل عدم الإجابة' },
    ],
  },
  {
    id: 'SQ-03',
    required: true,
    prompt_en: 'Over the past two weeks, has emotional distress made it hard for you to function in your daily life?',
    prompt_ar:
      'خلال الأسبوعين الماضيين، هل جعل الضيق النفسي أداء مهام حياتك اليومية أمرًا صعبًا عليك؟',
    options: [
      { code: 'F0', en: 'No', ar: 'لا' },
      { code: 'F1', en: 'Some days', ar: 'بعض الأيام' },
      { code: 'F2', en: 'Most days', ar: 'معظم الأيام' },
      { code: 'FX', en: 'Prefer not to answer', ar: 'أفضل عدم الإجابة' },
    ],
  },
];

export const SAFETY_QUESTION_IDS: readonly ('SQ-01' | 'SQ-02' | 'SQ-03')[] = ['SQ-01', 'SQ-02', 'SQ-03'];

/** SQ-01 codes that trigger the SQ-02 follow-up (Safety §3). */
export const SQ02_TRIGGER_CODES: readonly Sq01Code[] = ['S1', 'S2', 'SX'];

/** Approved deterministic copy (Safety §7). Exact wording; never generatively
 * rewritten (FR-020/FR-021, Safety §10). UNAVAILABLE is the fail-closed fallback. */
export const SAFETY_COPY: Readonly<Record<'DISTRESS' | 'HIGH_RISK' | 'CRISIS' | 'UNAVAILABLE', BilingualEntry>> = {
  DISTRESS: {
    en: 'Your answers suggest that several areas may feel difficult right now. This is not a diagnosis. You can continue, and you may also consider speaking with a qualified professional if these difficulties persist, worsen, or interfere with daily life.',
    ar: 'تشير إجاباتك إلى أن عدة جوانب قد تكون صعبة عليك حاليًا. هذه ليست نتيجة تشخيصية. يمكنك الاستمرار، وقد يكون من المفيد أيضًا التحدث مع مختص مؤهل إذا استمرت هذه الصعوبات أو ازدادت أو أثرت في حياتك اليومية.',
  },
  HIGH_RISK: {
    en: 'Thank you for telling us. Your safety matters more than continuing this assessment. Priora Mind is not an emergency or clinical service. Please seek prompt support from a qualified professional and tell someone you trust who can support you. If you begin to feel in immediate danger, contact your local emergency services now.',
    ar: 'شكرًا لأنك أخبرتنا. سلامتك أهم من استكمال هذا التقييم. Priora Mind ليست خدمة طوارئ أو خدمة علاجية. يُرجى طلب دعم عاجل من مختص مؤهل، وإخبار شخص تثق به ويمكنه دعمك. إذا شعرت أنك أصبحت في خطر فوري، فاتصل بخدمات الطوارئ المحلية الآن.',
  },
  CRISIS: {
    en: 'Your answers indicate that you may be in immediate danger. Priora Mind cannot provide emergency help. Contact your local emergency services now, and if possible move to a safer place and ask a trusted person nearby to stay with you. Do not remain alone while you may be in immediate danger.',
    ar: 'تشير إجاباتك إلى أنك قد تكون في خطر فوري. لا تستطيع Priora Mind تقديم مساعدة طارئة. اتصل بخدمات الطوارئ المحلية الآن، وانتقل إن أمكن إلى مكان أكثر أمانًا واطلب من شخص تثق به وقريب منك أن يبقى معك. لا تبق وحدك ما دمت قد تكون في خطر فوري.',
  },
  UNAVAILABLE: {
    en: 'We cannot safely evaluate your answers right now, so the assessment cannot continue. If you feel you may be in immediate danger, contact your local emergency services now and ask a trusted person nearby to stay with you. Otherwise, try again later.',
    ar: 'لا نستطيع تقييم إجاباتك بأمان الآن، لذلك لا يمكن متابعة التقييم. إذا شعرت أنك قد تكون في خطر فوري، فاتصل بخدمات الطوارئ المحلية الآن واطلب من شخص تثق به وقريب منك أن يبقى معك. بخلاف ذلك، حاول مرة أخرى لاحقًا.',
  },
};

export interface SafetyAction {
  id: 'seek_support' | 'emergency_services';
  label: BilingualEntry;
  type: 'navigate' | 'external_fallback';
}

/** Approved primary actions (Safety §6/§11). Labels are drawn from the approved
 * copy (not invented numbers/resources). HIGH_RISK → seek support (navigate to the
 * hold/re-entry page); CRISIS → contact local emergency services (external fallback). */
export const SAFETY_ACTIONS: Readonly<Record<'HIGH_RISK' | 'CRISIS', readonly SafetyAction[]>> = {
  HIGH_RISK: [
    {
      id: 'seek_support',
      label: {
        en: 'Seek support from a qualified professional',
        ar: 'اطلب دعمًا من مختص مؤهل',
      },
      type: 'navigate',
    },
  ],
  CRISIS: [
    {
      id: 'emergency_services',
      label: {
        en: 'Contact your local emergency services now',
        ar: 'اتصل بخدمات الطوارئ المحلية الآن',
      },
      type: 'external_fallback',
    },
  ],
};

export interface EmergencyResourceRef {
  country_code: string | null;
  text: BilingualEntry;
  approved: boolean;
}

/**
 * Approved emergency resources (Safety §8, FR-024). EMPTY for MVP — no hotline
 * number, provider, or contact is shown unless it exists in an approved, versioned
 * resource registry (Safety §13 launch gate). The copy directs the user to local
 * emergency services / a trusted nearby person as the generic fallback.
 */
export const APPROVED_RESOURCES: readonly EmergencyResourceRef[] = [];

/** Distress-pattern thresholds (Safety §5): ≥3 domains score below 25, OR the
 * Mood domain scores below 25. Reads domain scores as input — never from the result
 * row, and never as a safety level (FR-018/FR-019). */
export const DISTRESS_DOMAIN_THRESHOLD = 25;
export const DISTRESS_MIN_DOMAINS = 3;
export const MOOD_DOMAIN = 'mood';