export const COACHING_PLAN_PROMPT_TEMPLATE = {
  version: '1.0',
  instructions: [
    'Return only the requested structured bilingual JSON output.',
    'Use English and Arabic for every user-facing field.',
    'Stay within non-clinical coaching scope.',
    'Do not diagnose, mention medication, provide crisis counseling, or invent unsupported facts.',
    'Use only library keys present in the provided coaching library.',
  ],
} as const;
