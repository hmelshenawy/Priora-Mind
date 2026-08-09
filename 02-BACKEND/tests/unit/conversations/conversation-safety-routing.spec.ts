import { describe, expect, it } from 'vitest';
import { ConversationSafetyService } from '../../../src/modules/conversations/conversation-safety.service';

describe('conversation safety routing', () => {
  const safety = new ConversationSafetyService();

  it('routes high-risk and crisis content before normal processing', async () => {
    await expect(safety.evaluate('I feel suicidal')).resolves.toMatchObject({
      route: 'safety',
      level: 'HIGH_RISK',
    });
    await expect(safety.evaluate('I might harm myself now')).resolves.toMatchObject({
      route: 'safety',
      level: 'CRISIS',
    });
  });

  it('keeps ordinary low-risk distress in the normal coaching pipeline', async () => {
    await expect(safety.evaluate('I am feeling depressed')).resolves.toEqual({
      route: 'none',
      level: 'NORMAL',
    });
  });

  it('fails closed on safety check technical failure', async () => {
    await expect(safety.evaluate('__safety_check_throw__')).resolves.toMatchObject({
      route: 'failed',
      failureCode: 'SAFETY_UNAVAILABLE',
    });
  });
});
