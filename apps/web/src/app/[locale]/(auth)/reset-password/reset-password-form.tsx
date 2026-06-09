'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@toopo/ui/components/button';
import { Input } from '@toopo/ui/components/input';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { type JSX, useState } from 'react';
import { useForm } from 'react-hook-form';
import { authClient } from '../../../../lib/auth-client';
import { type ResetPasswordInput, ResetPasswordSchema } from '../../../../lib/auth-schemas';
import { routes } from '../../../../lib/routes';

export function ResetPasswordForm(): JSX.Element {
  const t = useTranslations('Auth.resetPassword');
  const tCommon = useTranslations('Auth.common');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { newPassword: '' },
  });

  if (token === null || token.length === 0) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {t('missingToken')}
      </p>
    );
  }

  const onSubmit = async (values: ResetPasswordInput): Promise<void> => {
    setServerError(null);
    const { error } = await authClient.resetPassword({
      newPassword: values.newPassword,
      token,
    });
    if (error !== null && error !== undefined) {
      setServerError(error.message ?? t('errorGeneric'));
      return;
    }
    router.push(routes.signinAfterReset(locale));
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3">
      <label htmlFor="reset-password-new" className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{t('newPasswordLabel')}</span>
        <Input
          id="reset-password-new"
          type="password"
          autoComplete="new-password"
          {...register('newPassword')}
        />
        {errors.newPassword ? (
          <span className="text-xs text-destructive">{tCommon('passwordTooShort')}</span>
        ) : (
          <span className="text-xs text-muted-foreground">{tCommon('passwordHint')}</span>
        )}
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
