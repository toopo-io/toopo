import { Injectable } from '@nestjs/common';
import { DEFAULT_LOCALE, type Locale, SUPPORTED_LOCALES } from '@toopo/i18n';
import i18next, { type i18n as I18nInstance } from 'i18next';
import { en } from './locales/en';
import './i18n.types';

export type InterpolationParams = Record<string, string | number | boolean>;

@Injectable()
export class I18nService {
  private readonly instance: I18nInstance;

  constructor() {
    this.instance = i18next.createInstance();
    this.instance.init({
      lng: DEFAULT_LOCALE,
      fallbackLng: DEFAULT_LOCALE,
      supportedLngs: [...SUPPORTED_LOCALES],
      ns: ['translation'],
      defaultNS: 'translation',
      resources: {
        en: { translation: en },
      },
      interpolation: { escapeValue: false },
      returnNull: false,
    });
  }

  translate(locale: Locale, key: string, params?: InterpolationParams): string {
    const translator = this.instance.getFixedT(locale) as unknown as (
      key: string,
      options?: Record<string, unknown>,
    ) => string;
    return translator(key, params);
  }
}
