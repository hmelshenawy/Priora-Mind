import { createHash } from 'node:crypto';

import type { BilingualText } from './coaching-library';

function canonicalDisclaimer(version: string, copy: BilingualText): string {
  return JSON.stringify({ copy: { ar: copy.ar, en: copy.en }, version });
}

export function coachingDisclaimerIntegrity(version: string, copy: BilingualText): string {
  return createHash('sha256').update(canonicalDisclaimer(version, copy)).digest('hex');
}

const copy: BilingualText = { en: '', ar: '' };

export const COACHING_DISCLAIMER_V1 = {
  version: '1.0',
  copy,
  integrity: coachingDisclaimerIntegrity('1.0', copy),
} as const;

export function approvedDisclaimerContentAvailable(): boolean {
  return Boolean(COACHING_DISCLAIMER_V1.copy.en && COACHING_DISCLAIMER_V1.copy.ar);
}
