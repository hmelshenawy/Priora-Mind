'use client';

import { useParams } from 'next/navigation';
import { RequireOnboarding } from '../../../../../components/guards/require-onboarding';
import { ChatPageView } from '../../../../../features/chat/chat-page-view';

export default function ConversationPage() {
  const params = useParams<{ conversationId: string }>();
  return (
    <RequireOnboarding>
      <ChatPageView conversationId={params.conversationId} />
    </RequireOnboarding>
  );
}
