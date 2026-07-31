import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

/**
 * Locale middleware — prefixes routes with the active locale and redirects
 * bare paths to the default locale (research D4). Static assets, API routes,
 * and Next internals are excluded from locale handling.
 */
export default createMiddleware(routing);

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};