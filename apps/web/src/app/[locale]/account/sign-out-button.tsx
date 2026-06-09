'use client';

import { Button } from '@toopo/ui/components/button';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { type JSX, useState } from 'react';
import { authClient } from '../../../lib/auth-client';

export function SignOutButton(): JSX.Element {
  const t = useTranslations('Auth.account');
  const locale = useLocale();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async (): Promise<void> => {
    setIsSigningOut(true);
    await authClient.signOut();
    router.push(`/${locale}/`);
    router.refresh();
  };

  return (
    <Button type="button" variant="outline" onClick={handleSignOut} disabled={isSigningOut}>
      {isSigningOut ? t('signingOut') : t('signOut')}
    </Button>
  );
}
