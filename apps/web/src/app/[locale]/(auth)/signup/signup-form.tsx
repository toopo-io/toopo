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
import { type SignupInput, SignupSchema } from '../../../../lib/auth-schemas';
import { absoluteRoutes, routes } from '../../../../lib/routes';

export function SignupForm(): JSX.Element {
  const t = useTranslations('Auth.signup');
  const tCommon = useTranslations('Auth.common');
  const locale = useLocale();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(SignupSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const onSubmit = async (values: SignupInput): Promise<void> => {
    setServerError(null);
    const { error } = await authClient.signUp.email({
      email: values.email,
      password: values.password,
      name: values.name,
      callbackURL: absoluteRoutes.verifyEmailDone(window.location.origin, locale),
    });
    if (error !== null && error !== undefined) {
      setServerError(error.message ?? t('errorGeneric'));
      return;
    }
    router.push(routes.verifyEmailWithEmail(locale, values.email));
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
      <label htmlFor="signup-name" className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{t('nameLabel')}</span>
        <Input id="signup-name" type="text" autoComplete="name" {...register('name')} />
        {errors.name ? (
          <span className="text-xs text-destructive">{tCommon('requiredField')}</span>
        ) : null}
      </label>
      <label htmlFor="signup-email" className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{t('emailLabel')}</span>
        <Input id="signup-email" type="email" autoComplete="email" {...register('email')} />
        {errors.email ? (
          <span className="text-xs text-destructive">{tCommon('invalidEmail')}</span>
        ) : null}
      </label>
      <label htmlFor="signup-password" className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{t('passwordLabel')}</span>
        <Input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          {...register('password')}
        />
        {errors.password ? (
          <span className="text-xs text-destructive">{tCommon('passwordTooShort')}</span>
        ) : (
          <span className="text-xs text-muted-foreground">{tCommon('passwordHint')}</span>
        )}
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
