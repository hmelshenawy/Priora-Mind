'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '../../../../../i18n/navigation';
import {
  useProfileQuery,
  usePutProfileMutation,
} from '../../../../../features/onboarding/profile-hooks';
import type { LanguageCode } from '../../../../../features/onboarding/profile.api';
import { ApiError } from '../../../../../lib/api-client';

/**
 * /onboarding/profile (US3, FR-009/FR-010/FR-011/FR-035, contracts/profile-onboarding.md).
 *
 * Collects the minimum profile: preferred language + IANA timezone (FR-009). The
 * language selector flips the URL locale so next-intl re-renders ALL visible
 * content + direction (RTL/LTR) immediately (FR-010/FR-011); the persisted
 * preference is written on save and drives every subsequent screen. Saved
 * progress is held server-side, so switching language never loses it (FR-011).
 *
 * Backend guards: requires EMAIL_VERIFIED + a granted consent record (the guard
 * returns 403 ONBOARDING_STEP_BLOCKED if consent is missing — we surface that and
 * send the user back to the boundary). Route guards are UX only (FR-028).
 */
export default function ProfilePage() {
  const t = useTranslations('onboarding.profile');
  const common = useTranslations('common');
  const locale = useLocale() as LanguageCode;
  const router = useRouter();

  const profileQuery = useProfileQuery();
  const putProfileMut = usePutProfileMutation();

  const timezones = useMemo(() => buildTimezones(), []);
  const defaultTz = useMemo(() => detectTimezone(timezones), [timezones]);

  const [timezone, setTimezone] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  // Restore the saved timezone when the profile loads (also after a locale
  // switch remounts the page and re-fetches — FR-011: saved progress persists).
  useEffect(() => {
    if (profileQuery.data?.timezone) setTimezone(profileQuery.data.timezone);
  }, [profileQuery.data?.timezone]);

  // Initialize once a saved value or the browser default is available.
  useEffect(() => {
    if (!timezone) {
      setTimezone(profileQuery.data?.timezone ?? defaultTz);
    }
  }, [timezone, profileQuery.data, defaultTz]);

  if (profileQuery.isLoading) {
    return (
      <Shell title={t('title')}>
        <p className="text-muted-foreground">{common('loading')}</p>
      </Shell>
    );
  }

  const notFound =
    profileQuery.error instanceof ApiError && profileQuery.error.status === 404;
  if (profileQuery.error && !notFound) {
    return (
      <Shell title={t('title')}>
        <p className="text-sm text-destructive">{t('loadError')}</p>
        <button
          onClick={() => profileQuery.refetch()}
          className="mt-2 rounded bg-primary px-4 py-2 font-medium text-primary-foreground"
        >
          {common('retry')}
        </button>
      </Shell>
    );
  }

  function switchLanguage(other: LanguageCode) {
    if (other === locale) return;
    // Flip the URL locale → next-intl re-renders content + direction (FR-010/FR-011).
    router.replace({ pathname: '/onboarding/profile', query: {} }, { locale: other });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!timezone || !timezones.has(timezone)) {
      setFormError(t('invalidTimezone'));
      return;
    }
    setFormError(null);
    try {
      await putProfileMut.mutateAsync({ language_code: locale, timezone });
      router.push('/assessment');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ONBOARDING_STEP_BLOCKED') {
        router.replace('/onboarding/boundary');
        return;
      }
      if (err instanceof ApiError && err.code === 'VALIDATION' && err.fields) {
        setFormError(t('invalidTimezone'));
        return;
      }
      setFormError(common('error'));
    }
  }

  return (
    <Shell title={t('title')}>
      <p className="text-sm text-muted-foreground">{t('intro')}</p>

      <form onSubmit={onSubmit} className="mt-4 w-full space-y-5" noValidate>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('languageLabel')}</legend>
          <div className="flex gap-2">
            {( ['en', 'ar'] as LanguageCode[]).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => switchLanguage(lang)}
                aria-pressed={locale === lang}
                className={
                  'flex-1 rounded border px-4 py-2 text-sm font-medium ' +
                  (locale === lang
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-foreground')
                }
              >
                {lang === 'en' ? t('english') : t('arabic')}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t('languageHint')}</p>
        </fieldset>

        <div className="space-y-1">
          <label htmlFor="timezone" className="block text-sm font-medium">
            {t('timezoneLabel')}
          </label>
          <select
            id="timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full rounded border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
          >
            {!timezone && <option value="">{t('selectTimezone')}</option>}
            {[...timezones].map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={putProfileMut.isPending}
          className="w-full rounded bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60"
        >
          {putProfileMut.isPending ? t('submitting') : t('saveContinue')}
        </button>
      </form>
    </Shell>
  );
}

/** IANA timezone set: runtime tz database + explicit 'UTC'. */
function buildTimezones(): Set<string> {
  const list =
    typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl
      ? (Intl.supportedValuesOf('timeZone') as string[])
      : [];
  return new Set([...list, 'UTC']);
}

/** Best-effort browser timezone; falls back to UTC if undeterminable/invalid. */
function detectTimezone(known: Set<string>): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && known.has(tz)) return tz;
  } catch {
    // resolvedOptions unsupported — fall back.
  }
  return 'UTC';
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