import { defineRouting } from 'next-intl/routing';

/**
 * Locale routing (research D4, Constitution X).
 * EN (LTR, default) and AR (RTL) are first-class equals. The persisted profile
 * preference drives the active locale (wired in US3); middleware handles the
 * /{locale} prefix and redirects bare paths to the default locale.
 */
export const routing = defineRouting({
  locales: ['en', 'ar'],
  defaultLocale: 'en',
});

export type AppLocale = (typeof routing.locales)[number];