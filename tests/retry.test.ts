import { describe, expect, it } from 'vitest';
import { errorCode, isRetryable, withRetry } from '../src/net/retry';

describe('withRetry', () => {
  it('retries network failures with the configured delays, then succeeds', async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error('offline');
      return 'ok';
    }, [0.5, 1, 2], isRetryable, async ms => { waits.push(ms); });
    expect(result).toBe('ok');
    expect(waits).toEqual([500, 1000]);
  });

  it('gives up after the last delay', async () => {
    const waits: number[] = [];
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw new Error('offline'); }, [0.5, 1, 2], isRetryable,
      async ms => { waits.push(ms); })).rejects.toThrow('offline');
    expect(calls).toBe(4);
    expect(waits).toEqual([500, 1000, 2000]);
  });

  it('never retries a server rejection', async () => {
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw { data: { code: 'CONFLICT' } }; }, [0.5], isRetryable,
      async () => {})).rejects.toEqual({ data: { code: 'CONFLICT' } });
    expect(calls).toBe(1);
  });
});

describe('errorCode', () => {
  it('reads the code from ConvexError data', () => {
    expect(errorCode({ data: { code: 'FULL' } })).toBe('FULL');
    expect(errorCode(new Error('x'))).toBeNull();
    expect(errorCode(null)).toBeNull();
    expect(errorCode({ data: 'text' })).toBeNull();
  });
});
