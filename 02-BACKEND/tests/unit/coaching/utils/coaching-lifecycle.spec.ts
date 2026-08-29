import { describe, expect, it } from 'vitest';
import { recomputePlanStatus } from '../../../../src/modules/coaching/utils/coaching-lifecycle';

describe('recomputePlanStatus', () => {
  it('marks the plan COMPLETED when all actions are complete', () => {
    expect(recomputePlanStatus(0)).toBe('COMPLETED');
  });

  it('keeps the plan ACTIVE while any action remains incomplete', () => {
    expect(recomputePlanStatus(1)).toBe('ACTIVE');
    expect(recomputePlanStatus(3)).toBe('ACTIVE');
  });

  it('returns ACTIVE when reopening an action from a completed plan', () => {
    expect(recomputePlanStatus(1)).toBe('ACTIVE');
  });
});
