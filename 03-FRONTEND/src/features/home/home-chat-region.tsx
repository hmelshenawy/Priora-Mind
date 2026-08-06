'use client';

import type { ConversationSummaryDto } from '@priora/shared-types';
import { useTranslations } from 'next-intl';
import { Link } from '../../i18n/navigation';

/**
 * Conversations region (FR-032 Priority 3 + 4). Renders the continue-chat card
 * (FR-017), start-new-conversation (FR-019), open-conversations (FR-018), and the
 * read-only recent-conversations list (FR-023). Owns its own loading / empty / error
 * surface so a conversations-query failure never hides the plan region (AD-9).
 *
 * This is an orchestration surface over existing chat capabilities: it navigates to
 * existing `/chat` routes and reuses `useCreateConversationMutation` via the page; it
 * does not re-implement chat logic (AD-0). The recent list is read-only — archive /
 * delete stay in the Spec 005 sidebar (FR-030).
 */

type ConversationsStatus = 'loading' | 'success' | 'error';

type HomeChatRegionProps = {
  /** Deterministic most-recently-updated active conversation (`items[0]`, FR-017). */
  continueTarget: ConversationSummaryDto | undefined;
  /** Bounded recent active conversations (`HOME_RECENT_CONVERSATIONS_LIMIT`). */
  recent: ConversationSummaryDto[];
  conversationsQueryStatus: ConversationsStatus;
  /** True while a manual error-retry refetch is in flight. */
  retrying: boolean;
  /** True while the start-new mutation is pending. */
  createPending: boolean;
  onContinue: (conversationId: string) => void;
  onStartNew: () => void;
  onRetryConversations: () => void;
};

/** Title fallback matching the existing `ConversationList.labelFor` pattern. */
function labelFor(conversation: ConversationSummaryDto, fallback: string): string {
  return conversation.title || `${fallback} ${new Date(conversation.createdAt).toLocaleDateString()}`;
}

export function HomeChatRegion(props: HomeChatRegionProps) {
  const t = useTranslations('home');
  const common = useTranslations('common');
  const { continueTarget, recent, conversationsQueryStatus, retrying, createPending, onContinue, onStartNew, onRetryConversations } = props;
  const hasRecent = recent.length > 0;
  const showContinue = conversationsQueryStatus === 'success' && Boolean(continueTarget);
  const showEmptyPrompt = conversationsQueryStatus === 'success' && !hasRecent;
  const showLoading = conversationsQueryStatus === 'loading' && !hasRecent;

  return (
    <section id="home-chat" aria-labelledby="home-chat-title" className="mt-10 w-full">
      <h2 id="home-chat-title" className="mb-4 text-lg font-semibold text-slate-950">{t('chatTitle')}</h2>

      {/* P3 — Continue chat (FR-017): hidden when there is no active conversation. */}
      {showContinue && continueTarget ? (
        <article className="mb-4 max-w-xl rounded-3xl border border-slate-200 bg-white p-6 text-start shadow-sm">
          <h3 className="text-xl font-semibold text-slate-950">{t('continueChatTitle')}</h3>
          <p className="mt-2 truncate text-slate-600">{labelFor(continueTarget, t('conversationFallback'))}</p>
          <button
            type="button"
            onClick={() => onContinue(continueTarget.id)}
            className="mt-4 rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
          >
            {t('continueChatAction')}
          </button>
        </article>
      ) : null}

      {/* P3 — Start a new conversation (FR-019). The empty state doubles as the FR-002b
          "start your first conversation" prompt (a plan present with no conversations is NOT
          an error). Start-new is independent of the conversations query, so it stays available
          on every non-error status. */}
      <article className="mb-4 max-w-xl rounded-3xl border border-slate-200 bg-white p-6 text-start shadow-sm">
        <h3 className="text-xl font-semibold text-slate-950">{showEmptyPrompt ? t('startFirstTitle') : t('startNewTitle')}</h3>
        <p className="mt-2 text-slate-600">{showEmptyPrompt ? t('startFirstBody') : t('startNewBody')}</p>
        <button
          type="button"
          onClick={onStartNew}
          disabled={createPending}
          className="mt-4 rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
        >
          {createPending ? t('startNewSubmitting') : t('startNewAction')}
        </button>
      </article>

      {/* AD-9 — Conversations-query error: a chat-region error card with a manual retry
          (refetch). Never hides the plan region; no cross-region retry coupling. */}
      {conversationsQueryStatus === 'error' ? (
        <article className="mb-4 max-w-xl rounded-3xl border border-slate-200 bg-white p-6 text-start shadow-sm">
          <h3 className="text-xl font-semibold text-slate-950">{t('chatErrorTitle')}</h3>
          <p className="mt-2 text-slate-600">{t('chatErrorBody')}</p>
          <button
            type="button"
            onClick={onRetryConversations}
            disabled={retrying}
            className="mt-4 rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
          >
            {t('chatErrorRetry')}
          </button>
        </article>
      ) : null}

      {/* Loading (initial load, no cached data). Plan region still renders. */}
      {showLoading ? <p className="mb-4 text-slate-600">{common('loading')}</p> : null}

      {/* P4 — Recent conversations (FR-023, read-only, bounded). SHOULD-omit on very small
          viewports (FR-023) via `hidden sm:block`; continue-chat and start-new stay visible. */}
      {hasRecent ? (
        <div className="hidden sm:block">
          <article className="max-w-xl rounded-3xl border border-slate-200 bg-white p-6 text-start shadow-sm">
            <h3 className="text-lg font-semibold text-slate-950">{t('recentTitle')}</h3>
            <ul className="mt-3 space-y-1">
              {recent.map((conversation) => (
                <li key={conversation.id}>
                  <Link
                    href={`/chat/${conversation.id}`}
                    className="block truncate rounded-2xl px-3 py-2 text-sm font-medium text-slate-950 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                  >
                    {labelFor(conversation, t('conversationFallback'))}
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href="/chat"
              className="mt-4 inline-block text-sm font-semibold text-slate-950 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
            >
              {t('openConversations')}
            </Link>
          </article>
        </div>
      ) : null}
    </section>
  );
}