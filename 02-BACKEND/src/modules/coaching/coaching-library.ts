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

const content: CoachingLibraryContent = {
  domains: [],
  pacingLabels: {},
  titleTemplates: [],
  summaryTemplates: [],
};

export const COACHING_LIBRARY_V1 = {
  version: '1.0',
  content,
  integrity: coachingLibraryIntegrity('1.0', content),
} as const;

export function approvedLibraryContentAvailable(): boolean {
  return COACHING_LIBRARY_V1.content.domains.length > 0;
}
