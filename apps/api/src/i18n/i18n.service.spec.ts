import { beforeEach, describe, expect, it } from 'vitest';
import { I18nService } from './i18n.service';

describe('I18nService', () => {
  let service: I18nService;

  beforeEach(() => {
    service = new I18nService();
  });

  it('translates a flat key', () => {
    expect(service.translate('en', 'errors.internal')).toBe('Internal server error');
  });

  it('interpolates params for too_small', () => {
    expect(
      service.translate('en', 'errors.validation.too_small', {
        path: 'intervalSeconds',
        minimum: 1,
      }),
    ).toBe('Field intervalSeconds must be at least 1');
  });

  it('interpolates params for too_big', () => {
    expect(
      service.translate('en', 'errors.validation.too_big', {
        path: 'intervalSeconds',
        maximum: 3600,
      }),
    ).toBe('Field intervalSeconds must be at most 3600');
  });

  it('translates not_integer', () => {
    expect(
      service.translate('en', 'errors.validation.not_integer', {
        path: 'intervalSeconds',
      }),
    ).toBe('Field intervalSeconds must be a whole number');
  });

  it('returns the resolved string when no params are provided', () => {
    expect(service.translate('en', 'errors.not_found')).toBe('Resource not found');
  });
});
