import { notFound } from 'next/navigation';
import { FallbackDemo } from './fallback-demo';

/**
 * Dev-only test route for the US7 missing-string fallback rule (FR-037, Safety
 * Matrix §11). It renders the REAL production fallback paths so the Playwright
 * suite (`tests/e2e/i18n-fallback.spec.ts`) can observe them deterministically:
 *   (1) a missing message-catalog key → `catalogFallback` token (the SAME token
 *       in both locales — never the other language's string);
 *   (2) a safety-critical bilingual entry missing the active locale → the
 *       documented DEFAULT-locale approved copy + a non-silent `usedFallback`
 *       flag (never a silent cross-language substitution).
 *
 * This route is excluded from production builds (`next build`) by calling
 * `notFound()` when `NODE_ENV === 'production'`, so it never ships or appears in
 * the production sitemap. It is only reachable in dev/test. It uses no backend
 * data, so it runs without the API server.
 */
export default function I18nFallbackPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <FallbackDemo />;
}