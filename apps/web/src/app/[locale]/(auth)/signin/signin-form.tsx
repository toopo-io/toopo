'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@toopo/ui/components/button';
import { Input } from '@toopo/ui/components/input';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { type JSX, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Env } from '../../../../../env';
import { authClient } from '../../../../lib/auth-client';
import { type SigninInput, SigninSchema } from '../../../../lib/auth-schemas';
import { absoluteRoutes } from '../../../../lib/routes';

export function SigninForm(): JSX.Element {
  const t = useTranslations('Auth.signin');
  const tCommon = useTranslations('Auth.common');
  const locale = useLocale();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SigninInput>({
    resolver: zodResolver(SigninSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: SigninInput): Promise<void> => {
    setServerError(null);
    const { error } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
      callbackURL: absoluteRoutes.account(window.location.origin, locale),
    });
    if (error !== null && error !== undefined) {
      setServerError(error.message ?? t('errorGeneric'));
      return;
    }
    router.push(`/${locale}/`);
    router.refresh();
  };

  const handleGoogle = async (): Promise<void> => {
    setServerError(null);
    const { error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL: absoluteRoutes.account(window.location.origin, locale),
    });
    if (error !== null && error !== undefined) {
      setServerError(error.message ?? t('errorGeneric'));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3">
      <label htmlFor="signin-email" className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{t('emailLabel')}</span>
        <Input id="signin-email" type="email" autoComplete="email" {...register('email')} />
        {errors.email ? (
          <span className="text-xs text-destructive">{tCommon('invalidEmail')}</span>
        ) : null}
      </label>
      <label htmlFor="signin-password" className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{t('passwordLabel')}</span>
        <Input
          id="signin-password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
        />
        {errors.password ? (
          <span className="text-xs text-destructive">{tCommon('requiredField')}</span>
        ) : null}
      </label>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t('submitting') : t('submit')}
      </Button>
      {Env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED ? (
        <>
          <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {tCommon('orDivider')}
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button type="button" variant="outline" onClick={handleGoogle} disabled={isSubmitting}>
            {tCommon('googleButton')}
          </Button>
        </>
      ) : null}
      {serverError !== null ? (
        <p className="text-sm text-destructive" role="alert">
          {serverError}
        </p>
      ) : null}
    </form>
  );
}
