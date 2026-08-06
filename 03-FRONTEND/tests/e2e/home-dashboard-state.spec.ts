import { expect, test } from '@playwright/test';
import type { ConversationSummaryDto } from '@priora/shared-types';
import { selectContinueChatTarget } from '../../src/features/home/home-chat';
import { resolveHomeDashboardView } from '../../src/features/home/home-dashboard-state';
import { resolvePrimaryAction } from '../../src/features/home/home-primary-action';

const conversation = (id: string): ConversationSummaryDto => ({
  id,
  title: `Conversation ${id}`,
  status: 'ACTIVE',
  createdAt: '2026-08-04T00:00:00.000Z',
  updatedAt: '2026-08-04T00:00:00.000Z',
  lastMessageAt: null,
});

test.describe('home dashboard foundational state', () => {
  test('asserts firstRun only with startable coaching and successful empty conversations', () => {
    expect(resolveHomeDashboardView({ coachingView: 'startable', conversationsQuery: { status: 'success', items: [] } })).toBe('firstRun');
    expect(resolveHomeDashboardView({ coachingView: 'startable', conversationsQuery: { status: 'loading', items: [] } })).toBe('startable');
    expect(resolveHomeDashboardView({ coachingView: 'startable', conversationsQuery: { status: 'error', items: [] } })).toBe('startable');
    expect(resolveHomeDashboardView({ coachingView: 'startable', conversationsQuery: { status: 'success', items: [conversation('c1')] } })).toBe('startable');
    expect(resolveHomeDashboardView({ coachingView: 'readyActive', conversationsQuery: { status: 'success', items: [] } })).toBe('readyActive');
  });

  test('maps every home state to the deterministic primary action', () => {
    // No-plan states rely on the single automatic generation flow — NO Generate CTA (AD-7).
    expect(resolvePrimaryAction('firstRun')).toBe('none');
    expect(resolvePrimaryAction('startable')).toBe('none');
    expect(resolvePrimaryAction('readyProposed')).toBe('accept-plan');
    expect(resolvePrimaryAction('readyActive')).toBe('continue-plan');
    expect(resolvePrimaryAction('readyCompleted')).toBe('review-completed-plan');
    expect(resolvePrimaryAction('failedRetryable')).toBe('retry');
    expect(resolvePrimaryAction('pending')).toBe('none');
    expect(resolvePrimaryAction('generating')).toBe('none');
    expect(resolvePrimaryAction('unavailable')).toBe('none');
    expect(resolvePrimaryAction('error')).toBe('none');
  });

  test('selects the first server-sorted active conversation deterministically', () => {
    const newest = conversation('newest');
    const older = conversation('older');
    expect(selectContinueChatTarget([newest, older])).toBe(newest);
    expect(selectContinueChatTarget([])).toBeUndefined();
  });
});
