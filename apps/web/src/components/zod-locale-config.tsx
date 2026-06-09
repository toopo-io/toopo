'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { z } from 'zod';
import { createZodErrorMap, type Translator } from '../i18n/zod-error-map';

export function ZodLocaleConfig(): null {
  const t = useTranslations();

  useEffect(() => {
    const translate: Translator = (key, params) =>
      t(key as Parameters<typeof t>[0], params as Parameters<typeof t>[1]);
    const errorMap = createZodErrorMap(translate);
    z.config({
      customError: (issue) => ({
        message: errorMap(issue as unknown as z.core.$ZodIssue),
      }),
    });
  }, [t]);

  return null;
}
