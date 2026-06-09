import 'i18next';
import type { ApiCatalog } from './locales/en';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: ApiCatalog;
    };
  }
}
