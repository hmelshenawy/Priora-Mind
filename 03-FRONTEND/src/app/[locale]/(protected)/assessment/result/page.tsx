'use client';

import { useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter, Link } from '../../../../../i18n/navigation';
import { ApiError } from '../../../../../lib/api-client';
import {
  useDefinitionQuery,
  useResultQuery,
} from '../../../../../features/assessment/assessment-hooks';
import type { DomainCode, LanguageCode } from '../../../../../features/assessment/assessment.api';

/**
 * /assessment/result (US5, FR-016/FR-017/FR-018, SC-002, contracts/assessment.md).
 * Renders the non-diagnostic coaching insight assembled server-side: 8 domain
 * scores + bands, strongest + support domain, selected priorities preserved
 * separately, the optional goal-alignment note, the explicit "not a diagnosis /
 * not a substitute for professional care" statement, and the transition point to
 * future coaching-plan creation. NO overall score is shown (FR-016). A button
 * leads to the /dashboard placeholder — the post-onboarding destination (US9).
 *
 * Suppression (FR-019b): while onboarding is SAFETY_HOLD the backend returns 409
 * SAFETY_HOLD (no insight); we fail closed. 404 (no result yet) → /assessment
 * (FR-033: route to the unfinished step). The bilingual framing copy comes from
 * the backend presenter (single source of truth — no EN/AR drift, Constitution X).
 */
export default function ResultPage() {
  const t = useTranslations('assessment.result');
  const common = useTranslations('common');
  const locale = useLocale() as LanguageCode;
  const router = useRouter();

  const def = useDefinitionQuery();
  const result = useResultQuery(true);

  useEffect(() => {
    if (result.error instanceof ApiError && result.error.status === 404) {
      router.replace('/assessment');
    }
  }, [result.error, router]);

  if (result.isLoading || def.isLoading) {
    return <Shell title={t('title')}><p className="text-muted-foreground">{common('loading')}</p></Shell>;
  }
  if (result.error instanceof ApiError && result.error.code === 'SAFETY_HOLD') {
    return <Shell title={t('title')}><p className="text-sm text-destructive">{t('safetyHold')}</p></Shell>;
  }
  if (result.error && !(result.error instanceof ApiError && result.error.status === 404)) {
    return (
      <Shell title={t('title')}>
        <p className="text-sm text-destructive">{common('error')}</p>
        <button onClick={() => result.refetch()} className="mt-2 rounded bg-primary px-4 py-2 font-medium text-primary-foreground">{common('retry')}</button>
      </Shell>
    );
  }

  const r = result.data!;
  const labels = def.data?.domain_labels[locale] ?? ({} as Record<DomainCode, string>);
  const bandLabel = (b: { label_en: string; label_ar: string }) => (locale === 'ar' ? b.label_ar : b.label_en);
  const bi = (e: { en: string; ar: string }) => (locale === 'ar' ? e.ar : e.en);

  return (
    <Shell title={t('title')}>
      {/* FR-017: the explicit non-diagnostic statement, prominent. */}
      <p className="rounded border border-primary/30 bg-primary/5 p-3 text-sm">
        {bi(r.non_diagnostic_statement)}
      </p>

      {/* US6 (Safety §6, FR-022): bounded supportive messaging when the final safety
          evaluation is DISTRESS. Shown ALONGSIDE the normal result (never for
          HIGH_RISK/CRISIS — those suppress the result via SAFETY_HOLD). Backend copy. */}
      {r.distress_note && (
        <p className="rounded border border-primary/20 bg-muted/40 p-3 text-sm">
          {bi(r.distress_note)}
        </p>
      )}

      <section className="space-y-2" aria-label={t('scoresLabel')}>
        <h2 className="text-sm font-semibold">{t('scoresLabel')}</h2>
        {r.domain_scores.map((s) => (
          <div key={s.domain} className="flex items-center justify-between gap-2 text-sm">
            <span>{labels[s.domain] ?? s.domain}</span>
            <span className="text-muted-foreground">{s.score} · {bandLabel(s.band)}</span>
          </div>
        ))}
      </section>

      <p className="text-sm">{t('strongest', { domain: labels[r.strongest_domain] ?? r.strongest_domain })}</p>
      <p className="text-sm">{t('support', { domain: labels[r.support_domain] ?? r.support_domain })}</p>

      {r.selected_priorities.domains.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {t('priorities')}: {r.selected_priorities.domains.map((d) => labels[d] ?? d).join(locale === 'ar' ? '، ' : ', ')}
        </p>
      )}

      {r.goal_alignment_note && (
        <p className="text-sm text-muted-foreground">{bi(r.goal_alignment_note)}</p>
      )}

      {/* FR-018: the transition point to future coaching-plan creation (no plan). */}
      <p className="text-sm">{bi(r.transition_point)}</p>

      <Link href="/dashboard" className="mt-2 block w-full rounded bg-primary px-4 py-2 text-center font-medium text-primary-foreground">
        {t('continue')}
      </Link>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-4 px-4 py-10">
      <div className="w-full max-w-xl space-y-4">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {children}
      </div>
    </main>
  );
}