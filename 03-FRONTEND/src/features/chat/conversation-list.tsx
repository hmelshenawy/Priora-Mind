'use client';

import type { ConversationSummaryDto } from '@priora/shared-types';

function labelFor(conversation: ConversationSummaryDto, fallback: string) {
  return conversation.title || `${fallback} ${new Date(conversation.createdAt).toLocaleDateString()}`;
}

export function ConversationList({
  conversations,
  selectedId,
  loading,
  error,
  includeArchived,
  labels,
  onCreate,
  onOpen,
  onToggleArchived,
  onArchive,
  onDelete,
}: {
  conversations: ConversationSummaryDto[];
  selectedId?: string;
  loading: boolean;
  error: boolean;
  includeArchived: boolean;
  labels: {
    title: string;
    loading: string;
    error: string;
    empty: string;
    newConversation: string;
    fallback: string;
    showArchived: string;
    hideArchived: string;
    archived: string;
    archive: string;
    unarchive: string;
    delete: string;
  };
  onCreate: () => void;
  onOpen: (conversationId: string) => void;
  onToggleArchived: () => void;
  onArchive: (conversationId: string, archived: boolean) => void;
  onDelete: (conversationId: string) => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm" aria-label={labels.title}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-950">{labels.title}</h2>
        <button type="button" onClick={onCreate} className="rounded-full bg-slate-950 px-3 py-2 text-sm font-semibold text-white">{labels.newConversation}</button>
      </div>
      <button type="button" onClick={onToggleArchived} className="self-start rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-700">
        {includeArchived ? labels.hideArchived : labels.showArchived}
      </button>
      {loading ? <p className="text-sm text-slate-600">{labels.loading}</p> : null}
      {error ? <p role="alert" className="text-sm text-red-700">{labels.error}</p> : null}
      {!loading && !error && conversations.length === 0 ? <p className="text-sm text-slate-600">{labels.empty}</p> : null}
      <nav className="min-h-0 space-y-2 overflow-y-auto" aria-label={labels.title}>
        {conversations.map((conversation) => (
          <article
            key={conversation.id}
            className="rounded-2xl border p-3 text-sm aria-[current=page]:border-slate-950"
            aria-current={conversation.id === selectedId ? 'page' : undefined}
          >
            <button type="button" onClick={() => onOpen(conversation.id)} className="w-full text-start font-medium text-slate-950 outline-none ring-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-slate-950">
              {labelFor(conversation, labels.fallback)}
            </button>
            {conversation.status === 'ARCHIVED' ? <span className="mt-1 block text-xs text-slate-500">{labels.archived}</span> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => onArchive(conversation.id, conversation.status !== 'ARCHIVED')} className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700">
                {conversation.status === 'ARCHIVED' ? labels.unarchive : labels.archive}
              </button>
              <button type="button" onClick={() => onDelete(conversation.id)} className="rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-700">
                {labels.delete}
              </button>
            </div>
          </article>
        ))}
      </nav>
    </aside>
  );
}
