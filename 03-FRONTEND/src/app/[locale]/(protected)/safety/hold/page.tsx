'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '../../../../../i18n/navigation';
import { ApiError } from '../../../../../lib/api-client';
import { useDefinitionQuery } from '../../../../../features/assessment/assessment-hooks';
import { useHoldQuery, useReentryMutation } from '../../../../../features/safety/safety-hooks';
import { bilingual } from '../../../../../i18n/fallback';
import type { LanguageCode, SafetyQuestion, SafetyRoute } from '../../../../../features/safety/safety.api';

/**
 * /safety/hold (US6, Safety Matrix §9/§11, FR-019b/FR-024/FR-037). The SAFETY_HOLD hub:
 * shows the approved safety copy (immediate focus + AT announcement, color not the
 * only indicator), the immutable historical evaluations (never relabeled), and the
 * user-initiated re-entry form that re-asks the safety questions. Re-entry NORMAL/
 * DISTRESS resumes the assessment (/assessment); HIGH_RISK/CRISIS repeats the route
 * (rendered with its primary action); 503 SAFETY_UNAVAILABLE shows the approved
 * fail-closed copy (FR-025). No invented numbers/resources (FR-024) — all copy is the
 * backend's approved deterministic content (Constitution X, AR/EN parity).
 */
export default function SafetyHoldPage() {
  const t = useTranslations('safety');
  const common = useTranslations('common');
  const locale = useLocale() as LanguageCode;
  const router = useRouter();

  const def = useDefinitionQuery();
  const hold = useHoldQuery();
  const reentryMut = useReentryMutation();

  const copyRef = useRef<HTMLDivElement>(null);
  const [sq01, setSq01] = useState<string | null>(null);
  const [sq02, setSq02] = useState<string | null>(null);
  const [sq03, setSq03] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<string | null>(null);
  const [heldRoute, setHeldRoute] = useState<SafetyRoute | null>(null);
  const [unavailable, setUnavailable] = useState<{ en: string; ar: string } | null>(null);

  // Safety §11: focus + announce the safety copy on mount and whenever it changes.
  useEffect(() => {
    copyRef.current?.focus();
  }, [hold.data]);

  const sqQuestions = useMemo<SafetyQuestion[]>(() => def.data?.safety_questions ?? [], [def.data]);
  const sq01Q = sqQuestions.find((q) => q.id === 'SQ-01');
  const sq02Q = sqQuestions.find((q) => q.id === 'SQ-02');
  const sq03Q = sqQuestions.find((q) => q.id === 'SQ-03');
  const sq02Shown = !!sq01 && ['S1', 'S2', 'SX'].includes(sq01);
  // US7: documented safety-critical bilingual selection (never a silent
  // cross-language fallback — see `i18n/fallback.ts`). `usedFallback` is a
  // coarse signal only (no sensitive content — FR-030).
  const holdCopy = bilingual(hold.data?.copy ?? { en: '', ar: '' }, locale);
  const bi = (e: { en: string; ar: string }) => bilingual(e, locale).text;

  if (def.isLoading || hold.isLoading) {
    return <Shell title={t('title')}><p className="text-muted-foreground">{common('loading')}</p></Shell>;
  }
  if (def.error || hold.error) {
    return (
      <Shell title={t('title')}>
        <p className="text-sm text-destructive">{common('error')}</p>
        <button onClick={() => { void def.refetch(); void hold.refetch(); }} className="mt-2 rounded bg-primary px-4 py-2 font-medium text-primary-foreground">{common('retry')}</button>
      </Shell>
    );
  }

  const level = hold.data!.level;
  const isCrisis = level === 'CRISIS';
  const severityLabel = isCrisis ? t('crisisLabel') : t('highRiskLabel');
  const severityGlyph = isCrisis ? '⚠' : '✋';

  async function onReentry(e: React.FormEvent) {
    e.preventDefault();
    setFieldErr(null);
    setUnavailable(null);
    if (!sq01 || !sq03 || (sq02Shown && !sq02)) {
      setFieldErr(t('reentryRequired'));
      return;
    }
    try {
      const res = await reentryMut.mutateAsync({
        re_evaluate: true,
        safety_answers: { 'SQ-01': sq01, ...(sq02 ? { 'SQ-02': sq02 } : {}), 'SQ-03': sq03 },
      });
      if (res.onboarding_state === 'ASSESSMENT_IN_PROGRESS') {
        router.replace('/assessment'); // resumed
        return;
      }
      // HIGH_RISK/CRISIS: hold persists; show the repeated route.
      setHeldRoute(res.safety_route);
      setSq01(null); setSq02(null); setSq03(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SAFETY_UNAVAILABLE') {
        setUnavailable(err.copy ?? { en: '', ar: '' }); // FR-025 fail-closed copy
      } else {
        setFieldErr(common('error'));
      }
    }
  }

  return (
    <Shell title={t('title')}>
      {/* Safety §11: focused + announced safety copy. Color is not the only indicator
          (text label + glyph precede the colored region — FR-037). */}
      <div ref={copyRef} tabIndex={-1} role="alert" aria-live="assertive" aria-label={severityLabel} className="outline-none">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden="true">{severityGlyph}</span>
          <span>{severityLabel}</span>
        </p>
        <div className={`mt-2 rounded border p-4 ${isCrisis ? 'border-destructive/60 bg-destructive/10' : 'border-primary/40 bg-primary/5'}`}>
          <p className="text-base font-medium">{holdCopy.text}</p>
        </div>
      </div>

      {/* Re-confirmed hold route (after a re-entry that kept SAFETY_HOLD). Renders the
          approved actions/resources (FR-024) with the primary emergency action clear. */}
      {heldRoute && (
        <div className="mt-4">
          <p className="text-sm font-medium">{bi(heldRoute.copy)}</p>
          <div className="mt-2 space-y-2">
            {heldRoute.actions.map((a) => (
              <span key={a.id} className={`block w-full rounded px-4 py-3 text-center font-semibold ${(isCrisis || a.id === 'emergency_services') ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'}`}>
                {bi(a.label)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 503 fail-closed copy (FR-025, Safety §10). */}
      {unavailable && (
        <p className="mt-3 rounded border border-destructive/40 bg-destructive/5 p-3 text-sm">{bi(unavailable)}</p>
      )}

      {/* Historical evaluations (immutable, never relabeled — Safety §9). */}
      {hold.data!.historical.length > 0 && (
        <section className="mt-4 space-y-1" aria-label={t('historicalTitle')}>
          <h2 className="text-sm font-semibold">{t('historicalTitle')}</h2>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {hold.data!.historical.map((h, i) => (
              <li key={i}>{h.evaluated_at.slice(0, 10)} · {h.level} · {h.trigger_context}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Re-entry form: re-ask the safety questions (Safety §9, contracts/safety.md). */}
      <form onSubmit={onReentry} className="mt-4 space-y-4" aria-label={t('reentryTitle')}>
        <h2 className="text-sm font-semibold">{t('reentryTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('reentryIntro')}</p>
        {sq01Q && <SafetyRadio question={sq01Q} locale={locale} value={sq01} onChange={setSq01} />}
        {sq02Shown && sq02Q && <SafetyRadio question={sq02Q} locale={locale} value={sq02} onChange={setSq02} />}
        {sq03Q && <SafetyRadio question={sq03Q} locale={locale} value={sq03} onChange={setSq03} />}
        {fieldErr && <p role="alert" className="text-sm text-destructive">{fieldErr}</p>}
        <button type="submit" disabled={reentryMut.isPending} className="w-full rounded bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60">
          {reentryMut.isPending ? t('reentrySubmitting') : t('reentrySubmit')}
        </button>
      </form>
    </Shell>
  );
}

/** A single safety-question radio group (re-entry form). Option wording is the
 * approved deterministic copy from the backend definition — never invented. */
function SafetyRadio({
  question, locale, value, onChange,
}: { question: SafetyQuestion; locale: LanguageCode; value: string | null; onChange: (v: string) => void }) {
  const prompt = locale === 'ar' ? question.prompt_ar : question.prompt_en;
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">{prompt}</legend>
      {question.options.map((o) => (
        <label key={o.code} className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name={question.id}
            value={o.code}
            checked={value === o.code}
            onChange={() => onChange(o.code)}
            className="h-4 w-4"
          />
          <span>{locale === 'ar' ? o.ar : o.en}</span>
        </label>
      ))}
    </fieldset>
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