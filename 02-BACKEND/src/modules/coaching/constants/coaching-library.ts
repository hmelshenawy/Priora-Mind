import { createHash } from 'node:crypto';

export interface BilingualText {
  en: string;
  ar: string;
}

export interface CoachingLibraryAction {
  libraryKey: string;
  copy: BilingualText;
  pacingLabel?: BilingualText;
}

export interface CoachingLibraryGoal {
  libraryKey: string;
  copy: BilingualText;
  actions: CoachingLibraryAction[];
}

export interface CoachingLibraryDomain {
  domain: string;
  focusAreaReasons: Record<string, BilingualText>;
  goals: CoachingLibraryGoal[];
}

export interface CoachingLibraryContent {
  domains: CoachingLibraryDomain[];
  pacingLabels: Record<string, BilingualText>;
  titleTemplates: BilingualText[];
  summaryTemplates: BilingualText[];
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function coachingLibraryIntegrity(version: string, content: CoachingLibraryContent): string {
  return createHash('sha256').update(`${version}:${canonicalJson(content)}`).digest('hex');
}

const DEVELOPMENT_FIXTURE_DOMAINS = ['mood', 'stress', 'confidence', 'sleep', 'focus', 'energy', 'balance', 'relationships'] as const;

/** Development/test fixture only. This is not production-approved coaching content. */
const content: CoachingLibraryContent = {
  domains: DEVELOPMENT_FIXTURE_DOMAINS.map((domain) => ({
    domain,
    focusAreaReasons: {
      fixture: {
        en: `Your assessment suggests that ${domain} is a useful area for a small coaching step.`,
        ar: `يشير تقييمك إلى أن مجال ${domain} مناسب لخطوة توجيهية صغيرة.`,
      },
    },
    goals: [{
      libraryKey: `dev.goal.${domain}`,
      copy: {
        en: `Build one practical routine for ${domain}.`,
        ar: `ابنِ روتينًا عمليًا واحدًا لمجال ${domain}.`,
      },
      actions: [{
        libraryKey: `dev.action.${domain}.check-in`,
        copy: {
          en: `Choose one small ${domain} step and note how it went.`,
          ar: `اختر خطوة صغيرة لمجال ${domain} وسجّل كيف سارت.`,
        },
        pacingLabel: { en: 'This week', ar: 'هذا الأسبوع' },
      }],
    }],
  })),
  pacingLabels: { weekly: { en: 'This week', ar: 'هذا الأسبوع' } },
  titleTemplates: [{ en: 'Your development coaching plan', ar: 'خطتك التوجيهية التجريبية' }],
  summaryTemplates: [{ en: 'A small plan based on your assessment priorities.', ar: 'خطة صغيرة مبنية على أولويات تقييمك.' }],
};

export const COACHING_LIBRARY_V1 = {
  version: '1.0',
  content,
  integrity: coachingLibraryIntegrity('1.0', content),
} as const;

export function approvedLibraryContentAvailable(): boolean {
  return process.env.NODE_ENV !== 'production' && COACHING_LIBRARY_V1.content.domains.length > 0;
}
