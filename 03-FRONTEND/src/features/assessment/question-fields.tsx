'use client';

import type { ReactNode } from 'react';
import type {
  DefinitionQuestion,
  DomainCode,
  LanguageCode,
} from './assessment.api';
import type { SafetyQuestion } from '../safety/safety.api';

/**
 * Per-kind answer field renderers for the assessment wizard (US4/US6, FR-014).
 * Controlled inputs: the wizard owns the draft state and persists on navigate
 * (PUT /assessment/answers/:id). Validation is backend-enforced (Zod → 400
 * VALIDATION with field paths, FR-037); these fields do only light client hints
 * (e.g. disable "Next" until the required field has a usable value) and never
 * invent clinical content. AG-03 free-text is the "Other goal" path — no
 * suggested-goal options are invented (launch-gated, Assessment §6). SQ-* (US6)
 * are unscored safety questions with a fixed code option set (Safety §3); the
 * option wording is the approved deterministic copy from the backend definition.
 */

type DomainLabels = { en: Record<DomainCode, string>; ar: Record<DomainCode, string> };

interface FieldProps {
  question: DefinitionQuestion | GoalQuestionLike | SafetyQuestion;
  locale: LanguageCode;
  domainLabels: DomainLabels;
  /** Domains selected in AG-01 — context for AG-02 rank + AG-03 per-domain text. */
  selectedDomains: DomainCode[];
  value: unknown;
  onChange: (v: unknown) => void;
  errorFields?: { path: string; message: string }[];
}

type GoalQuestionLike = {
  id: string;
  kind: string;
  required: boolean;
  prompt_en: string;
  prompt_ar: string;
};

const fieldErr = (id: string, ef?: { path: string; message: string }[]) =>
  ef?.find((f) => f.path === id || f.path.endsWith(`.${id}`) || f.path === '')?.message;

export function QuestionField(props: FieldProps): ReactNode {
  const { question } = props;
  if (question.id.startsWith('AS-')) return <CurrentStateField {...props} question={question as DefinitionQuestion} />;
  switch (question.id) {
    case 'AG-01': return <GoalSelectField {...props} />;
    case 'AG-02': return <GoalRankField {...props} />;
    case 'AG-03': return <GoalFreeTextAg03Field {...props} />;
    case 'AG-04': return <GoalFreeTextSingleField {...props} />;
    case 'AG-05': return <GoalFreeTextSingleField {...props} />;
    case 'SQ-01':
    case 'SQ-02':
    case 'SQ-03':
      return <SafetyField {...props} question={question as SafetyQuestion} />;
    default: return null;
  }
}

function CurrentStateField({
  question, locale, value, onChange, errorFields,
}: FieldProps & { question: DefinitionQuestion }): ReactNode {
  const labels = question.scale[locale];
  const current = typeof value === 'number' ? value : (value as { value?: number } | undefined)?.value;
  const err = fieldErr('value', errorFields);
  return (
    <fieldset className="space-y-2" aria-label={question[locale]}>
      <legend className="sr-only">{question[locale]}</legend>
      <div className="space-y-1">
        {labels.map((label, i) => (
          <label key={i} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={question.id}
              value={i}
              checked={current === i}
              onChange={() => onChange({ value: i })}
              className="h-4 w-4"
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
    </fieldset>
  );
}

function GoalSelectField({
  locale, domainLabels, selectedDomains, value, onChange, errorFields,
}: FieldProps): ReactNode {
  const chosen = Array.isArray((value as { domains?: DomainCode[] } | undefined)?.domains)
    ? ((value as { domains: DomainCode[] }).domains) : selectedDomains;
  const all: DomainCode[] = Object.keys(domainLabels[locale]) as DomainCode[];
  const err = fieldErr('domains', errorFields);
  const toggle = (d: DomainCode) => {
    const set = new Set(chosen);
    if (set.has(d)) set.delete(d); else if (set.size < 3) set.add(d);
    onChange({ domains: [...set] });
  };
  return (
    <fieldset className="space-y-1">
      <legend className="sr-only">Areas</legend>
      {all.map((d) => (
        <label key={d} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={chosen.includes(d)}
            onChange={() => toggle(d)}
            disabled={!chosen.includes(d) && chosen.length >= 3}
            className="h-4 w-4"
          />
          <span>{domainLabels[locale][d]}</span>
        </label>
      ))}
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
    </fieldset>
  );
}

function GoalRankField({
  locale, domainLabels, selectedDomains, value, onChange, errorFields,
}: FieldProps): ReactNode {
  const ranking = ((value as { ranking?: Record<string, number> } | undefined)?.ranking) ?? {};
  const n = selectedDomains.length;
  const used = new Set(Object.values(ranking));
  const err = fieldErr('ranking', errorFields);
  const set = (d: DomainCode, r: number | '') => {
    const next = { ...ranking };
    if (r === '') delete next[d]; else next[d] = r;
    onChange({ ranking: next });
  };
  return (
    <fieldset className="space-y-1">
      <legend className="sr-only">Rank</legend>
      {selectedDomains.map((d) => (
        <label key={d} className="flex items-center justify-between gap-2 text-sm">
          <span>{domainLabels[locale][d]}</span>
          <select
            value={ranking[d] ?? ''}
            onChange={(e) => set(d, e.target.value === '' ? '' : Number(e.target.value))}
            className="rounded border bg-background px-2 py-1"
          >
            <option value="">—</option>
            {Array.from({ length: n }, (_, i) => i + 1).map((r) => (
              <option key={r} value={r} disabled={used.has(r) && ranking[d] !== r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      ))}
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
    </fieldset>
  );
}

function GoalFreeTextAg03Field({
  locale, domainLabels, selectedDomains, value, onChange, errorFields,
}: FieldProps): ReactNode {
  const goals = ((value as { goals?: Record<string, { text?: string }> } | undefined)?.goals) ?? {};
  const err = fieldErr('goals', errorFields);
  const set = (d: DomainCode, text: string) => {
    onChange({ goals: { ...goals, [d]: { text } } });
  };
  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">Goals</legend>
      {selectedDomains.map((d) => (
        <div key={d} className="space-y-1">
          <label className="block text-sm font-medium">{domainLabels[locale][d]}</label>
          <textarea
            value={goals[d]?.text ?? ''}
            onChange={(e) => set(d, e.target.value)}
            maxLength={500}
            rows={2}
            className="w-full rounded border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      ))}
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
    </fieldset>
  );
}

function GoalFreeTextSingleField({
  question, locale, value, onChange, errorFields,
}: FieldProps): ReactNode {
  const text = (value as { text?: string } | undefined)?.text ?? '';
  const err = fieldErr('text', errorFields);
  const prompt = locale === 'ar'
    ? (question as GoalQuestionLike).prompt_ar
    : (question as GoalQuestionLike).prompt_en;
  return (
    <div className="space-y-1">
      <label className="block sr-only" htmlFor={question.id}>
        {prompt}
      </label>
      <textarea
        id={question.id}
        value={text}
        onChange={(e) => onChange({ text: e.target.value })}
        maxLength={500}
        rows={3}
        className="w-full rounded border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
      />
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
    </div>
  );
}

/** SQ-* (US6, Safety §3): a single-select radio over the approved code options. The
 * option wording (en/ar) is the approved deterministic copy from the backend definition
 * — never softened or invented client-side. The stored value is `{ code }`. */
function SafetyField({
  question, locale, value, onChange, errorFields,
}: FieldProps & { question: SafetyQuestion }): ReactNode {
  const current = (value as { code?: string } | undefined)?.code;
  const err = fieldErr('code', errorFields);
  return (
    <fieldset className="space-y-2" aria-label={locale === 'ar' ? question.prompt_ar : question.prompt_en}>
      <legend className="sr-only">{locale === 'ar' ? question.prompt_ar : question.prompt_en}</legend>
      <div className="space-y-1">
        {question.options.map((o) => (
          <label key={o.code} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={question.id}
              value={o.code}
              checked={current === o.code}
              onChange={() => onChange({ code: o.code })}
              className="h-4 w-4"
            />
            <span>{locale === 'ar' ? o.ar : o.en}</span>
          </label>
        ))}
      </div>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
    </fieldset>
  );
}