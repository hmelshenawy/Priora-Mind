export const CONVERSATION_LIMITS = {
  titleMaxLength: 120,
  messageMaxLength: 4000,
  defaultPageSize: 25,
  maxPageSize: 100,
  recentHistoryMessages: 10,
  recentHistoryMaxChars: 6000,
  ragLimit: 6,
  ragScoreThreshold: 0.7,
  ragMaxContextChars: 8000,
} as const;

export const CONVERSATION_FALLBACKS = {
  nonSafetyTechnical: "I'm having trouble processing that right now. Please try again in a moment.",
  safetyTechnical:
    "I'm having trouble completing the safety check right now, so I can't continue with coaching. If you are in immediate danger or may harm yourself, contact local emergency services now or reach out to a trusted nearby person for immediate help.",
  insufficientEvidence:
    "I don't have enough grounded information from the approved knowledge base to answer that safely right now.",
  insufficientContext:
    'Could you share a little more about what you mean so I can answer accurately?',
} as const;

export const CONVERSATION_COMMAND_RESPONSES = {
  help: 'You can ask for coaching support, grounding ideas, or information from the approved Priora knowledge base.',
  scope:
    'Priora Mind provides coaching and wellness education. It is not medical care, therapy, diagnosis, medication advice, or emergency support.',
} as const;
