import { describe, expect, it } from 'vitest';
import { hashContent } from './content-hash';

describe('hashContent', () => {
  it('hashes empty input to the known sha256 vector', () => {
    expect(hashContent(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('hashes "abc" to the known sha256 vector', () => {
    expect(hashContent(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is a pure function of the bytes', () => {
    const bytes = new TextEncoder().encode('toopo');
    expect(hashContent(bytes)).toBe(hashContent(bytes));
  });
});
