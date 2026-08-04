'use client';

import type { ConversationMessageDto } from '@priora/shared-types';
import { mapMessageState } from './chat-state';
import { CitationList } from './citation-list';

export function ConversationThread({ messages, loading, error, labels, onRetry }: { messages: ConversationMessageDto[]; loading: boolean; error: boolean; labels: { loading: string; error: string; empty: string; user: string; assistant: string; pending: string; clarification: string; insufficientEvidence: string; technicalFailure: string; safety: string; retry: string; sources: string }; onRetry?: () => void }) {
  if (loading) return <section className="rounded-3xl border bg-white p-6 text-slate-600">{labels.loading}</section>;
  if (error) return <section role="alert" className="rounded-3xl border bg-white p-6 text-red-700">{labels.error}</section>;
  if (messages.length === 0) return <section className="rounded-3xl border bg-white p-6 text-slate-600">{labels.empty}</section>;
  return (
    <section className="min-h-0 min-w-0 space-y-4 overflow-y-auto rounded-3xl border border-slate-200 bg-white p-4 shadow-sm" aria-live="polite">
      {messages.map((message) => {
        const state = mapMessageState(message);
        return (
        <article key={message.id} data-testid={`message-${state}`} className={message.role === 'user' ? 'ms-auto max-w-full rounded-3xl bg-slate-950 p-4 text-white md:max-w-2xl' : 'me-auto max-w-full rounded-3xl bg-slate-100 p-4 text-slate-950 md:max-w-2xl'}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-70">{message.role === 'user' ? labels.user : labels.assistant}</p>
          {message.role === 'assistant' && state !== 'completed' ? <p className="mb-2 text-sm font-medium">{labels[state]}</p> : null}
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
          {message.role === 'assistant' && state === 'technicalFailure' && onRetry ? (
            <button type="button" onClick={onRetry} className="mt-3 rounded-full border border-slate-300 px-3 py-1 text-sm font-medium">
              {labels.retry}
            </button>
          ) : null}
          {message.role === 'assistant' ? <CitationList sources={message.sources} label={labels.sources} /> : null}
        </article>
        );
      })}
    </section>
  );
}
