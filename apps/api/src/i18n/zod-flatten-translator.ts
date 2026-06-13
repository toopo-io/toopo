import type { Locale } from '@toopo/i18n';
import type { z } from 'zod';
import type { I18nService } from './i18n.service';
import { translateZodIssue } from './zod-issue.translator';

// Index signature satisfies the `ErrorResponse.details` contract
// (`Record<string, unknown>`) declared in `@toopo/api-contracts`.
export interface TranslatedFlatError {
  formErrors: string[];
  fieldErrors: Record<string, string[]>;
  [key: string]: unknown;
}

// Mirrors the shape of `z.flattenError` but routes every issue through the
// API i18n catalog (en/fr) so nested `details.fieldErrors[*]` strings carry
// the negotiated locale instead of Zod's built-in English defaults. See
// ADR-0009 "Error contract".
export function translateFlattenedZodError(
  zodError: z.ZodError,
  locale: Locale,
  i18n: Pick<I18nService, 'translate'>,
): TranslatedFlatError {
  const formErrors: string[] = [];
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of zodError.issues) {
    const translated = translateZodIssue(issue);
    const message = i18n.translate(locale, translated.key, translated.params);
    const firstPath = issue.path[0];
    if (firstPath === undefined) {
      formErrors.push(message);
      continue;
    }
    const key = String(firstPath);
    const bucket = fieldErrors[key];
    if (bucket === undefined) {
      fieldErrors[key] = [message];
    } else {
      bucket.push(message);
    }
  }
  return { formErrors, fieldErrors };
}
