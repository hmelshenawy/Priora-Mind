'use client';

import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { onMessageError, getMessageFallback } from './fallback';

/**
 * Client-side wrapper around `NextIntlClientProvider` that wires the US7
 * documented fallback handlers (`onMessageError` + `getMessageFallback`) so the
 * missing-string fallback rule applies uniformly to client-rendered strings —
 * not just server-rendered ones. The handlers are plain module functions
 * imported on the client (never passed across the React server/client boundary,
 * which forbids function props).
 *
 * The locale + messages are serializable data passed in from the server locale
 * layout; the handlers live entirely within this client component.
 */
export function IntlProvider({
  locale,
  messages,
  children,
}: {
  locale: string;
  messages: Record<string, unknown>;
  children: ReactNode;
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      onError={onMessageError}
      getMessageFallback={getMessageFallback}
    >
      {children}
    </NextIntlClientProvider>
  );
}