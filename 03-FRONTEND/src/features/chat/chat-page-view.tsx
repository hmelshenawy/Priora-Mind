'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '../../i18n/navigation';
import { ConversationList } from './conversation-list';
import { ConversationThread } from './conversation-thread';
import { MessageComposer } from './message-composer';
import { useConversationDetailQuery, useConversationListQuery, useCreateConversationMutation, useDeleteConversationMutation, useSendMessageMutation, useSetArchivedMutation } from './chat-hooks';
import { createIdempotencyKey } from './chat-idempotency';

export function ChatPageView({ conversationId }: { conversationId?: string }) {
  const t = useTranslations('chat');
  const common = useTranslations('common');
  const router = useRouter();
  const [includeArchived, setIncludeArchived] = useState(false);
  const conversations = useConversationListQuery(includeArchived);
  const detail = useConversationDetailQuery(conversationId);
  const create = useCreateConversationMutation();
  const send = useSendMessageMutation(conversationId);
  const setArchived = useSetArchivedMutation();
  const remove = useDeleteConversationMutation();
  const [lastFailedContent, setLastFailedContent] = useState<string | null>(null);

  const openConversation = (id: string) => router.push(`/chat/${id}`);
  const createConversation = () => create.mutate(undefined, { onSuccess: (data) => openConversation(data.conversation.id) });
  const sendMessage = (content: string) => {
    setLastFailedContent(content);
    send.mutate({ content, idempotencyKey: createIdempotencyKey() });
  };
  const retryFailed = () => {
    if (lastFailedContent) send.mutate({ content: lastFailedContent, idempotencyKey: createIdempotencyKey() });
  };
  const archiveConversation = (id: string, archived: boolean) => setArchived.mutate({ conversationId: id, archived });
  const deleteConversation = (id: string) => {
    if (!window.confirm(t('confirmDelete'))) return;
    remove.mutate(id, { onSuccess: () => { if (id === conversationId) router.push('/chat'); } });
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-50 px-4 py-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <header className="flex flex-col gap-3 rounded-3xl bg-slate-950 p-5 text-white md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{t('title')}</h1>
            <p className="mt-1 text-sm text-slate-200">{t('subtitle')}</p>
          </div>
          <Link href="/dashboard" className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950">
            {t('backToPlan')}
          </Link>
        </header>
        <div className="grid min-h-[70vh] min-w-0 gap-4 md:grid-cols-[20rem_minmax(0,1fr)]">
          <ConversationList
            conversations={conversations.data?.items ?? []}
            selectedId={conversationId}
            loading={conversations.isLoading || create.isPending}
            error={conversations.isError || create.isError}
            includeArchived={includeArchived}
            labels={{
              title: t('conversations'),
              loading: common('loading'),
              error: t('loadListError'),
              empty: t('emptyList'),
              newConversation: t('newConversation'),
              fallback: t('title'),
              showArchived: t('showArchived'),
              hideArchived: t('hideArchived'),
              archived: t('archived'),
              archive: t('archive'),
              unarchive: t('unarchive'),
              delete: t('delete'),
            }}
            onCreate={createConversation}
            onOpen={openConversation}
            onToggleArchived={() => setIncludeArchived((value) => !value)}
            onArchive={archiveConversation}
            onDelete={deleteConversation}
          />
          <div className="flex min-h-0 min-w-0 flex-col gap-3">
            <ConversationThread
              messages={detail.data?.messages ?? []}
              loading={Boolean(conversationId) && detail.isLoading}
              error={detail.isError}
              labels={{ loading: common('loading'), error: t('loadConversationError'), empty: t('emptyThread'), user: t('user'), assistant: t('assistant'), pending: t('pending'), clarification: t('clarification'), insufficientEvidence: t('insufficientEvidence'), technicalFailure: t('technicalFailure'), safety: t('safety'), retry: t('retrySend'), sources: t('sources') }}
              onRetry={retryFailed}
            />
            {conversationId ? (
              <MessageComposer
                disabled={send.isPending}
                labels={{ placeholder: t('messagePlaceholder'), send: t('send'), sending: t('sending'), emptyMessage: t('emptyMessage') }}
                onSend={sendMessage}
              />
            ) : null}
            {send.isError ? <p role="alert" className="text-sm text-red-700">{t('technicalFailure')}</p> : null}
          </div>
        </div>
      </div>
    </main>
  );
}
