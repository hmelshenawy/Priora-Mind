'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '../../../../i18n/navigation';
import { useVerifyEmailMutation, useResendVerificationMutation } from '../../../../features/auth/auth-hooks';
import { ApiError } from '../../../../lib/api-client';

/**
 * /verify-email (US1, FR-035). Reads `token` + `userId` from the query string and
 * verifies once on mount. Renders loading / verified / expired(410) / invalid(400)
 * / generic-error states. The expired state offers a resend form (retry).
 *
 * `useSearchParams` requires a Suspense boundary for static-rendered routes, so
 * the inner component is wrapped below.
 */
function VerifyEmailInner() {
  const t = useTranslations('public');
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const userId = params.get('userId') ?? '';

  const verifyMut = useVerifyEmailMutation();
  const resendMut = useResendVerificationMutation();
  const [resendEmail, setResendEmail] = useState('');
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    if (token && userId) {
      verifyMut.mutate({ token, userId });
    }
    // Run once per link — intentionally only depends on the link params.
  }, [token, userId]);

  const hasParams = Boolean(token && userId);

  if (!hasParams) {
    return (
      <Shell title={t('invalidTitle')}>
        <p className="text-muted-foreground">{t('invalidBody')}</p>
        <BackLink />
      </Shell>
    );
  }

  if (verifyMut.isPending) {
    return (
      <Shell title={t('verifyEmailTitle')}>
        <p className="text-muted-foreground">{t('verifying')}</p>
      </Shell>
    );
  }

  if (verifyMut.isSuccess) {
    return (
      <Shell title={t('verifiedTitle')}>
        <p className="text-muted-foreground">{t('verifiedBody')}</p>
        <Link
          href="/onboarding/boundary"
          className="mt-2 inline-block rounded bg-primary px-4 py-2 font-medium text-primary-foreground"
        >
          {t('continueToOnboarding')}
        </Link>
      </Shell>
    );
  }

  const code = verifyMut.error instanceof ApiError ? verifyMut.error.code : null;

  if (code === 'TOKEN_EXPIRED_OR_USED') {
    return (
      <Shell title={t('expiredTitle')}>
        <p className="text-muted-foreground">{t('expiredBody')}</p>
        {resendSent ? (
          <p className="mt-3 text-sm text-muted-foreground">{t('resendSent')}</p>
        ) : (
          <form
            className="mt-4 flex w-full max-w-sm flex-col gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!resendEmail) return;
              try {
                await resendMut.mutateAsync(resendEmail);
                setResendSent(true);
              } catch {
                setResendSent(true); // anti-enumeration: same confirmation regardless
              }
            }}
          >
            <label htmlFor="resend" className="text-sm font-medium">
              {t('resendLabel')}
            </label>
            <input
              id="resend"
              type="email"
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
              className="rounded border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
              required
            />
            <button
              type="submit"
              disabled={resendMut.isPending}
              className="rounded bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60"
            >
              {t('resendSubmit')}
            </button>
          </form>
        )}
        <BackLink />
      </Shell>
    );
  }

  if (code === 'TOKEN_INVALID') {
    return (
      <Shell title={t('invalidTitle')}>
        <p className="text-muted-foreground">{t('invalidBody')}</p>
        <BackLink />
      </Shell>
    );
  }

  // Network / unexpected error → generic with retry.
  return (
    <Shell title={t('verifyEmailTitle')}>
      <p className="text-muted-foreground">{t('errorGeneric')}</p>
      <button
        onClick={() => verifyMut.mutate({ token, userId })}
        className="mt-2 rounded bg-primary px-4 py-2 font-medium text-primary-foreground"
      >
        {t('retry')}
      </button>
      <BackLink />
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="flex max-w-md flex-col items-center gap-2">{children}</div>
    </main>
  );
}

function BackLink() {
  const t = useTranslations('public');
  return (
    <Link href="/register" className="mt-4 text-sm underline">
      {t('backToRegister')}
    </Link>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">…</div>}>
      <VerifyEmailInner />
    </Suspense>
  );
}