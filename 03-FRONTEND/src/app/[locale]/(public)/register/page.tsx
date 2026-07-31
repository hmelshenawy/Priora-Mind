'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations, useLocale } from 'next-intl';
import { z } from 'zod';
import { useRegisterMutation } from '../../../../features/auth/auth-hooks';
import { ApiError } from '../../../../lib/api-client';
import type { LanguageCode } from '../../../../features/auth/auth.api';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
type RegisterForm = z.infer<typeof schema>;

/**
 * /register (US1, FR-035). Collects email + password and POSTs to /auth/register.
 * The backend response is anti-enumeration (FR-004): on success we show the same
 * "check your inbox" message regardless of whether the account pre-existed.
 * Loading, validation-error, and generic-error states are all covered.
 */
export default function RegisterPage() {
  const t = useTranslations('public');
  const locale = useLocale();
  const [done, setDone] = useState(false);
  const registerMut = useRegisterMutation();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(schema) });

  async function onSubmit(values: RegisterForm) {
    try {
      await registerMut.mutateAsync({
        email: values.email,
        password: values.password,
        consent_language_code: locale as LanguageCode,
      });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION' && err.fields) {
        for (const f of err.fields) {
          // Map server field paths back onto the form; never echoes the value.
          setError(f.path as keyof RegisterForm, { message: f.message });
        }
      }
      // Non-validation errors are surfaced via registerMut.error below.
    }
  }

  if (done) {
    return (
      <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-semibold">{t('registerTitle')}</h1>
        <p className="max-w-md text-muted-foreground">{t('registerCheckEmail')}</p>
      </main>
    );
  }

  const genericError =
    registerMut.isError && !(registerMut.error instanceof ApiError && registerMut.error.code === 'VALIDATION')
      ? t('error')
      : null;

  return (
    <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="w-full max-w-sm space-y-2 text-center">
        <h1 className="text-2xl font-semibold">{t('registerTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('registerSubtitle')}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm space-y-4" noValidate>
        <div className="space-y-1">
          <label htmlFor="email" className="block text-sm font-medium">
            {t('emailLabel')}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder={t('emailPlaceholder')}
            {...register('email')}
            className="w-full rounded border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
            aria-invalid={!!errors.email}
          />
          {errors.email && (
            <p role="alert" className="text-sm text-destructive">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="block text-sm font-medium">
            {t('passwordLabel')}
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            {...register('password')}
            className="w-full rounded border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
            aria-invalid={!!errors.password}
          />
          {errors.password ? (
            <p role="alert" className="text-sm text-destructive">
              {errors.password.message}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{t('passwordHint')}</p>
          )}
        </div>

        {genericError && <p role="alert" className="text-sm text-destructive">{genericError}</p>}

        <button
          type="submit"
          disabled={isSubmitting || registerMut.isPending}
          className="w-full rounded bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60"
        >
          {isSubmitting || registerMut.isPending ? t('registerSubmitting') : t('submitRegister')}
        </button>
      </form>
    </main>
  );
}