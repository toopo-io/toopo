'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@toopo/ui/components/button';
import { Input } from '@toopo/ui/components/input';
import { useLocale, useTranslations } from 'next-intl';
import { type JSX, useState } from 'react';
import { useForm } from 'react-hook-form';
import { authClient } from '../../../../lib/auth-client';
import { type ForgotPasswordInput, ForgotPasswordSchema } from '../../../../lib/auth-schemas';
import { absoluteRoutes } from '../../../../lib/routes';

export function ForgotPasswordForm(): JSX.Element {
  const t = useTranslations('Auth.forgotPassword');
  const tCommon = useTranslations('Auth.common');
  const locale = useLocale();
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotPasswordInput): Promise<void> => {
    setServerError(null);
    const { error } = await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: absoluteRoutes.resetPassword(window.location.origin, locale),
    });
    if (error !== null && error !== undefined) {
      setServerError(error.message ?? t('errorGeneric'));
      return;
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t('successMessage')}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3">
      <label htmlFor="forgot-email" className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{t('emailLabel')}</span>
        <Input id="forgot-email" type="email" autoComplete="email" {...register('email')} />
        {errors.email ? (
          <span className="text-xs text-destructive">{tCommon('invalidEmail')}</span>
        ) : null}
      </label>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t('submitting') : t('submit')}
      </Button>
      {serverError !== null ? (
        <p className="text-sm text-destructive" role="alert">
          {serverError}
        </p>
      ) : null}
    </form>
  );
}
