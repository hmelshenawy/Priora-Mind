import type { ConversationSummaryDto } from '@priora/shared-types';
import type { CoachingDashboardView } from '../coaching/coaching-dashboard-state';

export type HomeDashboardState = CoachingDashboardView | 'firstRun';

export type ConversationsQueryState = {
  status: 'loading' | 'success' | 'error';
  items: ConversationSummaryDto[];
};

export function resolveHomeDashboardView(input: {
  coachingView: CoachingDashboardView;
  conversationsQuery: ConversationsQueryState;
}): HomeDashboardState {
  const { coachingView, conversationsQuery } = input;

  if (coachingView === 'startable' && conversationsQuery.status === 'success' && conversationsQuery.items.length === 0) {
    return 'firstRun';
  }

  return coachingView;
}
