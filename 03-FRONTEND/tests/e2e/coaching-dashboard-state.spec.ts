import { expect, test } from '@playwright/test';
import { resolveDashboardView, selectBilingualText, shouldPollPlan } from '../../src/features/coaching/coaching-dashboard-state';

test.describe('coaching dashboard state machine', () => {
  test('distinguishes startable no-plan from unavailable and other terminal errors', () => {
    expect(resolveDashboardView({ error: { code: 'PLAN_NOT_FOUND' } })).toBe('startable');
    expect(resolveDashboardView({ error: { code: 'PLAN_NOT_FOUND' }, startPending: true })).toBe('starting');
    expect(resolveDashboardView({ error: { code: 'PLAN_UNAVAILABLE', retryable: true } })).toBe('failedRetryable');
    expect(resolveDashboardView({ error: { code: 'PLAN_UNAVAILABLE', retryable: false } })).toBe('unavailable');
    expect(resolveDashboardView({ error: { code: 'PLAN_UNAVAILABLE', reason: 'RESULT_NOT_FOUND' } })).toBe('noAssessment');
    expect(resolveDashboardView({ error: { code: 'SAFETY_HOLD' } })).toBe('safetyHold');
    expect(resolveDashboardView({ error: { code: 'ONBOARDING_STEP_BLOCKED' } })).toBe('ineligible');
  });

  test('polls only while pending or generating and stops on ready or failed', () => {
    expect(shouldPollPlan({ plan_id: 'p1', generationStatus: 'PENDING' })).toBe(true);
    expect(shouldPollPlan({ plan_id: 'p1', generationStatus: 'GENERATING' })).toBe(true);
    expect(shouldPollPlan({ plan_id: 'p1', generationStatus: 'FAILED' })).toBe(false);
    expect(shouldPollPlan({ plan_id: 'p1', generationStatus: 'READY', planStatus: 'PROPOSED' } as never)).toBe(false);
  });

  test('resolves every ready lifecycle state', () => {
    expect(resolveDashboardView({ data: { plan_id: 'p1', generationStatus: 'PENDING' } })).toBe('pending');
    expect(resolveDashboardView({ data: { plan_id: 'p1', generationStatus: 'GENERATING' } })).toBe('generating');
    expect(resolveDashboardView({ data: { plan_id: 'p1', generationStatus: 'FAILED' } })).toBe('failedRetryable');
    expect(resolveDashboardView({ data: { plan_id: 'p1', generationStatus: 'READY', planStatus: 'PROPOSED' } as never })).toBe('readyProposed');
    expect(resolveDashboardView({ data: { plan_id: 'p1', generationStatus: 'READY', planStatus: 'ACTIVE' } as never })).toBe('readyActive');
    expect(resolveDashboardView({ data: { plan_id: 'p1', generationStatus: 'READY', planStatus: 'COMPLETED' } as never })).toBe('readyCompleted');
  });

  test('locale switching uses stored bilingual content without changing state', () => {
    const title = { en: 'Plan', ar: 'خطة' };
    expect(selectBilingualText(title, 'en')).toBe('Plan');
    expect(selectBilingualText(title, 'ar')).toBe('خطة');
    expect(resolveDashboardView({ data: { plan_id: 'p1', generationStatus: 'READY', planStatus: 'ACTIVE' } as never })).toBe('readyActive');
  });
});
