import { createHash } from 'node:crypto';

import type { BilingualText } from './coaching-library';

function canonicalDisclaimer(version: string, copy: BilingualText): string {
  return JSON.stringify({ copy: { ar: copy.ar, en: copy.en }, version });
}

export function coachingDisclaimerIntegrity(version: string, copy: BilingualText): string {
  return createHash('sha256').update(canonicalDisclaimer(version, copy)).digest('hex');
}

/** Development/test fixture only. This is not production-approved disclaimer copy. */
const copy: BilingualText = {
  en: 'Development fixture: coaching support only. It does not provide medical care or emergency support.',
  ar: 'محتوى تجريبي للتطوير: دعم توجيهي فقط، ولا يقدم رعاية طبية أو دعمًا للطوارئ.',
};

export const COACHING_DISCLAIMER_V1 = {
  version: '1.0',
  copy,
  integrity: coachingDisclaimerIntegrity('1.0', copy),
} as const;

export function approvedDisclaimerContentAvailable(): boolean {
  return process.env.NODE_ENV !== 'production' && Boolean(COACHING_DISCLAIMER_V1.copy.en && COACHING_DISCLAIMER_V1.copy.ar);
}
