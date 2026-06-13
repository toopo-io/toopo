import type { LocaleCatalog } from '@toopo/i18n';

export const en = {
  errors: {
    validation: {
      failed: 'Validation failed',
      too_small: 'Field {{path}} must be at least {{minimum}}',
      too_big: 'Field {{path}} must be at most {{maximum}}',
      invalid_type: 'Field {{path}} must be of type {{expected}}',
      not_integer: 'Field {{path}} must be a whole number',
    },
    internal: 'Internal server error',
    unauthorized: 'Unauthorized',
    forbidden: 'Forbidden',
    not_found: 'Resource not found',
    conflict: 'Conflict',
    rate_limited: 'Too many requests',
    service_unavailable: 'Service unavailable',
  },
} as const satisfies LocaleCatalog;

export type ApiCatalog = typeof en;
