import { describe, expect, it } from 'vitest';
import { ConversationAccessService } from '../../../src/modules/conversations/conversation-access.service';
import {
  ConversationOnboardingRequiredException,
  ConversationSafetyHoldException,
} from '../../../src/modules/conversations/conversation.errors';

function serviceFor(state: string | null) {
  return new ConversationAccessService({
    onboardingState: { findFirst: async () => (state ? { state } : null) },
  } as never);
}

describe('conversation access', () => {
  it('allows only completed onboarding users', async () => {
    await expect(serviceFor('COMPLETED').assertEligible('user-1')).resolves.toBeUndefined();
    await expect(serviceFor(null).assertEligible('user-1')).rejects.toBeInstanceOf(
      ConversationOnboardingRequiredException,
    );
    await expect(serviceFor('ASSESSMENT_PENDING').assertEligible('user-1')).rejects.toBeInstanceOf(
      ConversationOnboardingRequiredException,
    );
  });

  it('blocks SAFETY_HOLD users before normal conversation processing', async () => {
    await expect(serviceFor('SAFETY_HOLD').assertEligible('user-1')).rejects.toBeInstanceOf(
      ConversationSafetyHoldException,
    );
  });
});
