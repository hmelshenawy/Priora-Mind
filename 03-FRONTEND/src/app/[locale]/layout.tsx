import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { routing } from '../../i18n/routing';
import { IntlProvider } from '../../i18n/intl-provider';
import { QueryProvider } from '../../providers/query-provider';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Priora Mind',
  description: 'Mental-wellness coaching — onboarding & assessment',
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Locale root layout. `lang` + `dir` are driven by the active locale
 * (Constitution X: AR RTL / EN LTR). The Intl + React Query providers wrap all
 * descendants so client components can use translations and server state.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <IntlProvider locale={locale} messages={messages}>
          <QueryProvider>{children}</QueryProvider>
        </IntlProvider>
      </body>
    </html>
  );
}