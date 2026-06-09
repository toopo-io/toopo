import { describe, expect, it, vi } from 'vitest';
import type { GrammarSource } from '../plugin/language-plugin';
import { loadGrammar } from './grammar-cache';

describe('loadGrammar', () => {
  it('evicts a failed load so a later call retries instead of caching the rejection', async () => {
    const load = vi.fn(() => Promise.reject(new Error('boom')));
    const grammar: GrammarSource = { id: 'fail-x', load };

    await expect(loadGrammar(grammar)).rejects.toThrow('boom');
    await expect(loadGrammar(grammar)).rejects.toThrow('boom');

    expect(load).toHaveBeenCalledTimes(2);
  });
});
