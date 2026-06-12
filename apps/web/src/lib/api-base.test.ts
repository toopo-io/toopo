import { describe, expect, it } from 'vitest';
import { pickBaseUrl } from './api-base';

const PUBLIC = 'https://api.example.com';
const INTERNAL = 'http://api:4000';

describe('pickBaseUrl', () => {
  it('uses the internal origin server-side when it is set', () => {
    expect(pickBaseUrl({ isServer: true, internalUrl: INTERNAL, publicUrl: PUBLIC })).toBe(
      INTERNAL,
    );
  });

  it('falls back to the public origin server-side when no internal origin is set', () => {
    expect(pickBaseUrl({ isServer: true, internalUrl: undefined, publicUrl: PUBLIC })).toBe(PUBLIC);
  });

  it('uses the public origin in the browser even when an internal origin is set', () => {
    expect(pickBaseUrl({ isServer: false, internalUrl: INTERNAL, publicUrl: PUBLIC })).toBe(PUBLIC);
  });

  it('uses the public origin in the browser when no internal origin is set', () => {
    expect(pickBaseUrl({ isServer: false, internalUrl: undefined, publicUrl: PUBLIC })).toBe(
      PUBLIC,
    );
  });
});
