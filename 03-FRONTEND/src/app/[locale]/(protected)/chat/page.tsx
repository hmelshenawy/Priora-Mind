'use client';

import { RequireOnboarding } from '../../../../components/guards/require-onboarding';
import { ChatPageView } from '../../../../features/chat/chat-page-view';

export default function ChatPage() {
  return (
    <RequireOnboarding>
      <ChatPageView />
    </RequireOnboarding>
  );
}
