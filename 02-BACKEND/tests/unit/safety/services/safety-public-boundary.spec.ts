import { describe, expect, it } from 'vitest';
import { SafetyService } from '../../../../src/modules/safety/safety.public';
import { SAFETY_COPY } from '../../../../src/modules/safety/constants/safety-definition';

const safety = new SafetyService(undefined as never, undefined as never, undefined as never);

describe('Safety public boundary', () => {
  it('preserves the canonical SQ-02 follow-up rule', () => {
    expect(safety.requiresFollowUpForSq01('S0')).toBe(false);
    expect(safety.requiresFollowUpForSq01('S1')).toBe(true);
    expect(safety.requiresFollowUpForSq01('S2')).toBe(true);
    expect(safety.requiresFollowUpForSq01('SX')).toBe(true);
  });

  it('returns the exact approved distress projection', () => {
    expect(safety.distressSupportCopy()).toEqual(SAFETY_COPY.DISTRESS);
  });

  it('preserves conversation-specific routing and exact approved copy', () => {
    expect(safety.evaluateConversation('I am feeling depressed')).toEqual({
      level: 'NORMAL',
      content: null,
    });
    expect(safety.evaluateConversation('I feel suicidal')).toEqual({
      level: 'HIGH_RISK',
      content: SAFETY_COPY.HIGH_RISK.en,
    });
    expect(safety.evaluateConversation('I might harm myself now')).toEqual({
      level: 'CRISIS',
      content: SAFETY_COPY.CRISIS.en,
    });
    expect(() => safety.evaluateConversation('__safety_check_throw__')).toThrow(
      'safety check failed',
    );
  });
});
