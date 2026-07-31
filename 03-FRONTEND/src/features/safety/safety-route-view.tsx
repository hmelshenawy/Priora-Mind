'use client';

import { useEffect, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '../../i18n/navigation';
import { bilingual } from '../../i18n/fallback';
import type { LanguageCode } from './safety.api';
import type { SafetyRoute } from './safety.api';

/**
 * SafetyRouteView (US6, Safety Matrix §11, FR-024/FR-037). Renders the approved
 * deterministic `safety_route` payload: the bilingual copy, the primary action(s),
 * and any approved emergency resources. The copy is the single source of truth from
 * the backend — this component NEVER invents hotline numbers, provider names, or
 * clinical wording (FR-024). When no approved resources exist, the copy itself
 * directs the user to local emergency services / a trusted nearby person.
 *
 * Accessibility (Safety §11):
 *  - The safety message receives immediate focus on mount (auto-focus the region)
 *    and is announced to assistive technology via `role="alert"` + `aria-live`.
 *  - Color is NOT the only severity indicator: a visible text label + glyph precede
 *    the colored region so the level is conveyed without color (FR-037).
 *  - The primary emergency action (CRISIS → contact local emergency services) is
 *    visually + semantically the dominant action.
 *
 * Bilingual: the active locale selects EN/AR copy; the layout direction is driven by
 * the document `dir` (Constitution X, AR/EN parity).
 */
export function SafetyRouteView({ route }: { route: SafetyRoute }) {
  const t = useTranslations('safety');
  const locale = useLocale() as LanguageCode;
  const regionRef = useRef<HTMLDivElement>(null);

  // Safety §11: immediate focus on the safety message so AT announces it.
  useEffect(() => {
    regionRef.current?.focus();
  }, []);

  // US7: documented safety-critical bilingual selection (never a silent
  // cross-language fallback — see `i18n/fallback.ts`). `usedFallback` is surfaced
  // as a COARSE signal only (no sensitive content — FR-030).
  const copy = bilingual(route.copy, locale);
  useEffect(() => {
    if (copy.usedFallback) console.warn('[safety] copy locale fallback used (default-locale)');
  }, [copy.usedFallback]);
  const bi = (e: { en: string; ar: string }) => bilingual(e, locale).text;
  const isCrisis = route.level === 'CRISIS';
  const severityLabel = isCrisis ? t('crisisLabel') : t('highRiskLabel');
  const severityGlyph = isCrisis ? '⚠' : '✋'; // not the only indicator; a text label follows

  return (
    <div
      ref={regionRef}
      tabIndex={-1}
      role="alert"
      aria-live="assertive"
      aria-label={severityLabel}
      className="outline-none"
    >
      {/* Severity badge: text + glyph FIRST so color is not the only indicator (FR-037). */}
      <p className="flex items-center gap-2 text-sm font-semibold" aria-hidden={false}>
        <span aria-hidden="true">{severityGlyph}</span>
        <span>{severityLabel}</span>
      </p>

      {/* The approved deterministic copy (FR-020/FR-021). Prominent + focused region. */}
      <div
        className={`mt-2 rounded border p-4 ${
          isCrisis ? 'border-destructive/60 bg-destructive/10' : 'border-primary/40 bg-primary/5'
        }`}
      >
        <p className="text-base font-medium">{copy.text}</p>
      </div>

      {/* Approved emergency resources (FR-024). Empty by default — the copy is the fallback. */}
      {route.resources.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          {route.resources.map((r, i) => (
            <li key={i}>{bi(r.text)}</li>
          ))}
        </ul>
      )}

      {/* Primary actions. CRISIS emergency_services is the visually dominant action.
          No invented number (FR-024): the `external_fallback` action is rendered as a
          prominent non-link affordance (we have no approved number to dial); the
          approved copy above already directs the user to their local emergency
          services. The `navigate` action links to the hold/re-entry page. */}
      <div className="mt-4 space-y-2">
        {route.actions.map((a) => {
          const label = bi(a.label);
          const dominant = isCrisis || a.id === 'emergency_services';
          const cls = `block w-full rounded px-4 py-3 text-center font-semibold ${
            dominant
              ? 'bg-destructive text-destructive-foreground'
              : 'bg-primary text-primary-foreground'
          }`;
          return a.type === 'navigate' ? (
            <Link key={a.id} href="/safety/hold" className={cls}>
              {label}
            </Link>
          ) : (
            <span key={a.id} className={cls}>{label}</span>
          );
        })}
      </div>
    </div>
  );
}