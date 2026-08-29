export const completedConversationUser = {
  id: '22222222-2222-4222-8222-222222222222',
  emailVerified: true,
  onboardingState: 'COMPLETED',
  safetyHold: false,
};

export const incompleteConversationUser = {
  id: '44444444-4444-4444-8444-444444444444',
  emailVerified: true,
  onboardingState: 'ASSESSMENT_PENDING',
  safetyHold: false,
};

export const safetyHoldConversationUser = {
  id: '55555555-5555-4555-8555-555555555555',
  emailVerified: true,
  onboardingState: 'SAFETY_HOLD',
  safetyHold: true,
};
