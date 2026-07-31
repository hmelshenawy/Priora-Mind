'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '../../../../../i18n/navigation';
import { useNoticesQuery, useRecordConsentMutation } from '../../../../../features/onboarding/consent-hooks';
import type { LanguageCode } from '../../../../../features/onboarding/consent.api';
import { ApiError } from '../../../../../lib/api-client';

/**
 * /onboarding/boundary (US2, FR-005/FR-006/FR-035, Consent policy §3/§4).
 *
 * Presents the service-boundary disclosure + Terms/Privacy Notice links, then
 * requires three SEPARATE explicit acknowledgments (Consent §4) — checkboxes are
 * never preselected. "Agree and continue" is disabled until all three are checked.
 *
 * Fail-closed (FR-007): if notices cannot be determined (503 NOTICES_UNAVAILABLE),
 * the form is blocked and no consent can be recorded. Re-consent (FR-008): a 409
 * surfaces a "review and consent again" notice and refetches the current notices.
 */
export default function BoundaryPage() {
  const t = useTranslations('onboarding.boundary');
  const common = useTranslations('common');
  const locale = useLocale() as LanguageCode;
  const router = useRouter();

  const notices = useNoticesQuery(locale);
  const consentMut = useRecordConsentMutation();

  const [ackBoundary, setAckBoundary] = useState(false);
  const [ackTerms, setAckTerms] = useState(false);
  const [ackPrivacy, setAckPrivacy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const langKey: LanguageCode = locale === 'ar' ? 'ar' : 'en';

  if (notices.isLoading) {
    return (
      <Shell title={t('title')}>
        <p className="text-muted-foreground">{common('loading')}</p>
      </Shell>
    );
  }

  // Fail-closed or fetch error → cannot proceed.
  const fetchErrCode = notices.error instanceof ApiError ? notices.error.code : null;
  if (notices.error) {
    const unavailable = fetchErrCode === 'NOTICES_UNAVAILABLE';
    return (
      <Shell title={unavailable ? t('unavailableTitle') : t('title')}>
        <p className="text-muted-foreground">
          {unavailable ? t('unavailableBody') : t('loadError')}
        </p>
        <button
          onClick={() => notices.refetch()}
          className="mt-2 rounded bg-primary px-4 py-2 font-medium text-primary-foreground"
        >
          {common('retry')}
        </button>
      </Shell>
    );
  }

  const data = notices.data!;
  const boundaryText = data.service_boundary_text[langKey];
  const termsLink = data.terms_link[langKey];
  const privacyLink = data.privacy_notice_link[langKey];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ackBoundary || !ackTerms || !ackPrivacy) {
      setFormError(t('mustAckAll'));
      return;
    }
    setFormError(null);
    try {
      await consentMut.mutateAsync({
        service_boundary_version: data.service_boundary_version,
        terms_version: data.terms_version,
        privacy_notice_version: data.privacy_notice_version,
        acknowledgments: {
          service_boundary: ackBoundary,
          terms: ackTerms,
          privacy_notice: ackPrivacy,
        },
        consent_language_code: langKey,
        product_channel_id: 'priora-mind-web',
      });
      router.push('/onboarding/profile');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'RECONSENT_REQUIRED') {
        setFormError(t('reconsentNotice'));
        void notices.refetch();
      } else if (err instanceof ApiError && err.code === 'ACKNOWLEDGMENTS_INCOMPLETE') {
        setFormError(t('mustAckAll'));
      } else if (err instanceof ApiError && err.code === 'NOTICES_UNAVAILABLE') {
        setFormError(t('unavailableBody'));
        void notices.refetch();
      } else {
        setFormError(common('error'));
      }
    }
  }

  const allChecked = ackBoundary && ackTerms && ackPrivacy;

  return (
    <Shell title={t('title')}>
      <p className="text-sm text-muted-foreground">{t('intro')}</p>

      <section
        className="mt-4 max-h-64 overflow-auto rounded border bg-background p-4 text-sm leading-relaxed"
        aria-label={t('boundarySectionTitle')}
      >
        {boundaryText}
      </section>

      <form onSubmit={onSubmit} className="mt-4 w-full space-y-3" noValidate>
        <Checkbox
          id="ack-boundary"
          checked={ackBoundary}
          onChange={setAckBoundary}
          label={t('boundaryAck')}
        />
        <Checkbox
          id="ack-terms"
          checked={ackTerms}
          onChange={setAckTerms}
          label={t('termsAck')}
          link={termsLink || undefined}
          linkPendingLabel={t('termsLinkPending')}
        />
        <Checkbox
          id="ack-privacy"
          checked={ackPrivacy}
          onChange={setAckPrivacy}
          label={t('privacyAck')}
          link={privacyLink || undefined}
          linkPendingLabel={t('privacyLinkPending')}
        />

        {formError && (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={!allChecked || consentMut.isPending}
          className="w-full rounded bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60"
        >
          {consentMut.isPending ? t('submitting') : t('agreeContinue')}
        </button>
      </form>
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

function Checkbox({
  id,
  checked,
  onChange,
  label,
  link,
  linkPendingLabel,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  link?: string;
  linkPendingLabel?: string;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-2 text-sm">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border"
      />
      <span>
        {label}
        {link ? (
          <>
            {' '}
            <a href={link} target="_blank" rel="noreferrer" className="underline">
              {link}
            </a>
          </>
        ) : linkPendingLabel ? (
          <span className="text-muted-foreground"> — {linkPendingLabel}</span>
        ) : null}
      </span>
    </label>
  );
}