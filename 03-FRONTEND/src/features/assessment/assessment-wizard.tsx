'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '../../i18n/navigation';
import { ApiError } from '../../lib/api-client';
import { routeForStep } from '../onboarding/onboarding-routes';
import {
  useDefinitionQuery,
  useAssessmentQuery,
  useSaveAnswerMutation,
  useRestartMutation,
  useSubmitMutation,
} from './assessment-hooks';
import { assessmentApi } from './assessment.api';
import type {
  DomainCode,
  LanguageCode,
} from './assessment.api';
import { QuestionField } from './question-fields';

/**
 * Assessment wizard (US4, FR-012/FR-014/FR-015/FR-035, contracts/assessment.md).
 * Intro → one-question-at-a-time → review → idempotent submit. Resume is driven
 * by GET /assessment `next_question_id`; drafts are seeded from `answered` and
 * persisted per-answer (PUT). Submit is duplicate-safe (FR-035/AC-X4): the
 * button is disabled while pending and a duplicate 200 navigates to the result.
 *
 * NORMAL path only. SAFETY_HOLD/CRISIS routing + SQ questions land in US6; the
 * non-diagnostic presenter + COMPLETED transition land in US5. If the backend
 * returns SAFETY_HOLD (US5/US6), we surface a generic blocked state fail-closed.
 */
export function AssessmentWizard() {
  const t = useTranslations('assessment');
  const common = useTranslations('common');
  const locale = useLocale() as LanguageCode;
  const router = useRouter();

  const def = useDefinitionQuery();
  const view = useAssessmentQuery();
  const saveMut = useSaveAnswerMutation();
  const restartMut = useRestartMutation();
  const submitMut = useSubmitMutation();

  // 0 = intro; 1..N = questions; N+1 = review.
  const [step, setStep] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, unknown>>({});
  const [errorFields, setErrorFields] = useState<{ path: string; message: string }[] | undefined>();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [blockMsg, setBlockMsg] = useState<string | null>(null);
  // US8 (FR-014b): explicit confirmation before any restart. The "Start over"
  // action and the safe-restart action both reveal a confirm/cancel pair before
  // clearing saved answers — restart is never one-click.
  const [confirmingRestart, setConfirmingRestart] = useState(false);

  const questions = useMemo(() => {
    if (!def.data) return [] as { id: string; kind?: string; required: boolean; prompt_en?: string; prompt_ar?: string }[];
    // US6: append the three safety questions at the END of the flow (safety gates
    // completion, Safety §4). SQ-02 is included only when SQ-01 ∈ {S1,S2,SX} (the
    // server enforces the same gate and rejects SQ-02 otherwise).
    const sq01Code = (drafts['SQ-01'] as { code?: string } | undefined)?.code;
    const sq02Shown = !!sq01Code && ['S1', 'S2', 'SX'].includes(sq01Code);
    const safety = def.data.safety_questions
      .filter((q) => q.id !== 'SQ-02' || sq02Shown)
      .map((q) => ({ id: q.id, required: q.required, prompt_en: q.prompt_en, prompt_ar: q.prompt_ar }));
    return [
      ...def.data.questions.map((q) => ({ id: q.id, required: q.required })),
      ...def.data.goal_questions.map((g) => ({ id: g.id, kind: g.kind, required: g.required, prompt_en: g.prompt_en, prompt_ar: g.prompt_ar })),
      ...safety,
    ];
  }, [def.data, drafts]);

  const answeredMap = useMemo(() => {
    const m: Record<string, unknown> = {};
    (view.data?.answered ?? []).forEach((a) => (m[a.question_id] = a.value));
    return m;
  }, [view.data]);

  // Seed drafts from the server view (also after a refetch / locale remount).
  useEffect(() => {
    setDrafts((prev) => ({ ...answeredMap, ...prev }));
  }, [answeredMap]);

  // Resume at the first unanswered required question (FR-014 resume). US6: if the
  // active view carries a `safety_route` (SUSPENDED / SAFETY_HOLD), route to the
  // safety hold page instead of showing the wizard — the assessment is interrupted.
  // US8: if `requires_safe_restart` is set, do NOT auto-advance — the wizard
  // renders the safe-restart screen (no stale answers are resumed).
  useEffect(() => {
    if (!def.data || !view.data || step !== 0) return;
    if (view.data.safety_route) {
      router.replace('/safety/hold');
      return;
    }
    if (view.data.requires_safe_restart) return;
    if (view.data.assessment_state === 'SCORED' || view.data.assessment_state === 'SUBMITTED') {
      router.replace('/assessment/result');
      return;
    }
    const next = view.data.next_question_id;
    if (next) {
      const idx = questions.findIndex((q) => q.id === next);
      if (idx >= 0) setStep(idx + 1);
    }
  }, [def.data, view.data, questions, step, router]);

  if (def.isLoading || view.isLoading) {
    return <Shell title={t('title')}><p className="text-muted-foreground">{common('loading')}</p></Shell>;
  }
  if (def.error || view.error) {
    const code = (def.error instanceof ApiError ? def.error.code : null) ?? (view.error instanceof ApiError ? view.error.code : null);
    if (code === 'ONBOARDING_STEP_BLOCKED') {
      // US8 (FR-033/FR-035): redirect to the unfinished step the backend names,
      // not a hardcoded one. `nextStep` comes from `error.next` via ApiError.
      const stepErr = (def.error instanceof ApiError ? def.error : null) ?? (view.error instanceof ApiError ? view.error : null);
      router.replace(routeForStep(stepErr?.nextStep));
      return null;
    }
    return (
      <Shell title={t('title')}>
        <p className="text-sm text-destructive">{t('loadError')}</p>
        <button onClick={() => { void def.refetch(); void view.refetch(); }} className="mt-2 rounded bg-primary px-4 py-2 font-medium text-primary-foreground">{common('retry')}</button>
      </Shell>
    );
  }

  // US8 (FR-034, SC-007): corrupt/inconsistent progress — offer a safe restart.
  // Stale answers are NOT resumed and no partial result is kept; the user must
  // explicitly confirm starting over (FR-014b) before answers are cleared.
  if (view.data?.requires_safe_restart) {
    return (
      <Shell title={t('safeRestartTitle')}>
        <p className="text-sm text-muted-foreground">{t('safeRestartBody')}</p>
        {confirmingRestart ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('restartConfirm')}</p>
            <div className="flex gap-2">
              <button
                onClick={onRestart}
                disabled={restartMut.isPending}
                className="flex-1 rounded bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60"
              >
                {restartMut.isPending ? t('restarting') : t('confirmRestart')}
              </button>
              <button
                onClick={() => setConfirmingRestart(false)}
                disabled={restartMut.isPending}
                className="flex-1 rounded border px-4 py-2 font-medium"
              >
                {t('cancelRestart')}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingRestart(true)}
            className="w-full rounded bg-primary px-4 py-2 font-medium text-primary-foreground"
          >
            {t('safeRestartAction')}
          </button>
        )}
      </Shell>
    );
  }

  const d = def.data!;
  const domainLabels = d.domain_labels;
  const selectedDomains: DomainCode[] = (drafts['AG-01'] as { domains?: DomainCode[] } | undefined)?.domains ?? [];

  function isAnswered(qid: string, required: boolean): boolean {
    if (!required) return true; // optional (AG-04/05) always pass
    const v = drafts[qid];
    if (qid.startsWith('AS-')) return typeof (v as { value?: number } | undefined)?.value === 'number';
    if (qid === 'AG-01') return Array.isArray((v as { domains?: unknown[] } | undefined)?.domains) && ((v as { domains: unknown[] }).domains).length >= 1;
    if (qid === 'AG-02') {
      const r = (v as { ranking?: Record<string, number> } | undefined)?.ranking ?? {};
      const sel = selectedDomains;
      return sel.length > 0 && sel.every((dd) => typeof r[dd] === 'number') && new Set(sel.map((dd) => r[dd])).size === sel.length;
    }
    if (qid === 'AG-03') {
      const g = (v as { goals?: Record<string, { text?: string }> } | undefined)?.goals ?? {};
      return selectedDomains.length > 0 && selectedDomains.every((dd) => (g[dd]?.text ?? '').trim().length > 0);
    }
    if (qid.startsWith('SQ-')) return typeof (v as { code?: string } | undefined)?.code === 'string';
    return true;
  }

  async function persist(qid: string): Promise<{ ok: boolean; route?: unknown }> {
    const draft = drafts[qid];
    if (draft === undefined) return { ok: true }; // nothing to save (skipped optional)
    setErrorFields(undefined);
    try {
      const res = await saveMut.mutateAsync({ questionId: qid, body: draft });
      return { ok: true, route: res.safety_route };
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION') {
        setErrorFields(err.fields);
        return { ok: false };
      }
      if (err instanceof ApiError && err.code === 'ONBOARDING_STEP_BLOCKED') {
        // US8 (FR-033/FR-035): route to the unfinished step the backend names.
        router.replace(routeForStep(err.nextStep));
        return { ok: false };
      }
      if (err instanceof ApiError && err.code === 'SAFETY_HOLD') {
        router.replace('/safety/hold'); // US6: held mid-flow
        return { ok: false };
      }
      setBlockMsg(common('error'));
      return { ok: false };
    }
  }

  async function onNext() {
    const q = questions[step - 1];
    if (!q) return;
    if (!isAnswered(q.id, q.required)) { setErrorFields(undefined); setBlockMsg(t('requiredHint')); return; }
    const r = await persist(q.id);
    if (!r.ok) return;
    // US6: a HIGH_RISK/CRISIS answer interrupts → route to the safety hold page.
    if (r.route) {
      router.replace('/safety/hold');
      return;
    }
    // Jump to the server-authoritative next question (skips SQ-02 when SQ-01 is not
    // triggered; lands on the review step when next_question_id is null).
    const refetched = await view.refetch();
    setBlockMsg(null);
    const nextId = refetched.data?.next_question_id ?? null;
    if (!nextId) {
      setStep(questions.length + 1);
      return;
    }
    const idx = questions.findIndex((qq) => qq.id === nextId);
    setStep(idx >= 0 ? idx + 1 : (s) => s + 1);
  }

  async function onBack() {
    if (step === 0) return;
    setStep((s) => Math.max(0, s - 1));
    setBlockMsg(null);
    setErrorFields(undefined);
  }

  async function onRestart() {
    try {
      await restartMut.mutateAsync();
    } catch (err) {
      // US8: a blocked restart routes to the unfinished step; SAFETY_HOLD routes
      // to safety. Otherwise surface a generic error (never silently clear).
      if (err instanceof ApiError && err.code === 'ONBOARDING_STEP_BLOCKED') {
        router.replace(routeForStep(err.nextStep));
      } else if (err instanceof ApiError && err.code === 'SAFETY_HOLD') {
        router.replace('/safety/hold');
      } else {
        setBlockMsg(common('error'));
      }
      return;
    }
    // US8 (FR-014b): restart confirmed — clear drafts, re-anchor to the first
    // question, and refetch the view (which now has the current definition
    // version and no requires_safe_restart). Exit the confirmation flow.
    setDrafts({});
    setStep(1);
    setConfirmingRestart(false);
    await view.refetch();
  }

  async function onSubmit() {
    setSubmitError(null);
    try {
      await submitMut.mutateAsync();
      router.push('/assessment/result');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INCOMPLETE') {
        // The shared ApiError doesn't surface `error.missing`, so jump to the
        // first missing required question via a fresh view (its next_question_id
        // points there — answers are unchanged on a failed submit).
        setSubmitError(t('incomplete'));
        try {
          const v = await assessmentApi.getAssessment();
          const idx = questions.findIndex((q) => q.id === v.next_question_id);
          if (idx >= 0) setStep(idx + 1);
        } catch {
          // keep the inline message; the user can navigate manually
        }
        return;
      }
      if (err instanceof ApiError && err.code === 'SAFETY_HOLD') {
        router.replace('/safety/hold'); // US6: submit suppressed → safety hold page
        return;
      }
      setSubmitError(common('error'));
    }
  }

  // ── intro ──
  if (step === 0) {
    return (
      <Shell title={t('title')}>
        <p className="text-sm text-muted-foreground">{d.instruction[locale]}</p>
        <p className="text-xs text-muted-foreground">{t('notDiagnosis')}</p>
        <button onClick={() => setStep(1)} className="mt-2 w-full rounded bg-primary px-4 py-2 font-medium text-primary-foreground">{t('begin')}</button>
      </Shell>
    );
  }

  // ── review ──
  if (step > questions.length) {
    const answeredCount = questions.filter((q) => isAnswered(q.id, q.required)).length;
    return (
      <Shell title={t('reviewTitle')}>
        <p className="text-sm text-muted-foreground">{t('reviewIntro', { count: answeredCount, total: questions.length })}</p>
        {submitError && <p role="alert" className="text-sm text-destructive">{submitError}</p>}
        <div className="mt-2 flex gap-2">
          <button onClick={onBack} className="flex-1 rounded border px-4 py-2 font-medium">{common('back')}</button>
          <button onClick={onSubmit} disabled={submitMut.isPending} className="flex-1 rounded bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60">{submitMut.isPending ? t('submitting') : t('submit')}</button>
        </div>
      </Shell>
    );
  }

  // ── question ──
  const q = questions[step - 1];
  const defQ = d.questions.find((x) => x.id === q.id);
  const goal = d.goal_questions.find((x) => x.id === q.id);
  const safetyQ = d.safety_questions.find((x) => x.id === q.id);
  const prompt = defQ
    ? defQ[locale]
    : safetyQ
      ? (locale === 'ar' ? safetyQ.prompt_ar : safetyQ.prompt_en)
      : (locale === 'ar' ? (goal?.prompt_ar ?? '') : (goal?.prompt_en ?? ''));
  const canNext = isAnswered(q.id, q.required);
  return (
    <Shell title={t('title')}>
      <Progress value={step} total={questions.length} />
      <h2 className="text-lg font-medium">{prompt}</h2>
      <QuestionField
        question={(defQ ?? safetyQ ?? goal)!}
        locale={locale}
        domainLabels={domainLabels}
        selectedDomains={selectedDomains}
        value={drafts[q.id]}
        onChange={(v) => setDrafts((p) => ({ ...p, [q.id]: v }))}
        errorFields={errorFields}
      />
      {blockMsg && <p role="alert" className="text-sm text-destructive">{blockMsg}</p>}
      <div className="mt-2 flex gap-2">
        <button onClick={onBack} className="flex-1 rounded border px-4 py-2 font-medium">{common('back')}</button>
        <button onClick={onNext} disabled={saveMut.isPending || !canNext} className="flex-1 rounded bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60">{saveMut.isPending ? common('loading') : common('continue')}</button>
      </div>
      {/* US8 (FR-014b): "Start over" requires explicit confirmation — restart is
          never one-click. The inline confirm/cancel pair clears saved answers
          only after the user confirms. */}
      {confirmingRestart ? (
        <div className="mt-2 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{t('restartConfirm')}</p>
          <div className="flex gap-2">
            <button onClick={onRestart} disabled={restartMut.isPending} className="flex-1 rounded bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60">{restartMut.isPending ? t('restarting') : t('confirmRestart')}</button>
            <button onClick={() => setConfirmingRestart(false)} disabled={restartMut.isPending} className="flex-1 rounded border px-4 py-2 text-xs font-medium">{t('cancelRestart')}</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setConfirmingRestart(true)} disabled={restartMut.isPending} className="mt-1 text-xs text-muted-foreground underline disabled:opacity-60">{t('startOver')}</button>
      )}
    </Shell>
  );
}

function Progress({ value, total }: { value: number; total: number }) {
  const t = useTranslations('assessment');
  return (
    <div className="text-xs text-muted-foreground">
      {t('progress', { current: value, total })}
      <div className="mt-1 h-1.5 w-full rounded bg-muted"><div className="h-1.5 rounded bg-primary" style={{ width: `${(value / (total + 1)) * 100}%` }} /></div>
    </div>
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