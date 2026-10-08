import { describe, expect, it, vi } from 'vitest';
import { copyText } from '../src/ui/copyText';

describe('copyText', () => {
  it('reports success when the Clipboard API writes the text', async () => {
    const writeText = vi.fn(async (_t: string): Promise<void> => undefined);
    expect(await copyText('http://x/?room=ABCDE', { writeText })).toBe(true);
    expect(writeText).toHaveBeenCalledWith('http://x/?room=ABCDE');
  });

  it('reports failure without throwing when there is no Clipboard API (a non-secure http:// origin)', async () => {
    expect(await copyText('link', undefined)).toBe(false);
    expect(await copyText('link', {} as never)).toBe(false);
  });

  it('reports failure without throwing when the write is refused or throws', async () => {
    expect(await copyText('link', { writeText: () => Promise.reject(new Error('denied')) })).toBe(false);
    expect(await copyText('link', { writeText: () => { throw new Error('boom'); } })).toBe(false);
  });
});
