import type { OnlineErrorCode } from '../rules/onlineTypes';

/** The `code` a Convex function threw via `ConvexError({ code })`, or null for network/unknown errors. */
export function errorCode(error: unknown): OnlineErrorCode | null {
  if (!error || typeof error !== 'object' || !('data' in error)) return null;
  const data = (error as { data: unknown }).data;
  if (!data || typeof data !== 'object' || !('code' in data)) return null;
  const code = (data as { code: unknown }).code;
  return typeof code === 'string' ? (code as OnlineErrorCode) : null;
}

/** Server rejections are final; anything else (offline, timeout) is worth retrying. */
export const isRetryable = (error: unknown): boolean => errorCode(error) === null;

export async function withRetry<T>(fn: () => Promise<T>, delaysSeconds: readonly number[],
  retryable: (error: unknown) => boolean,
  sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!retryable(error) || attempt >= delaysSeconds.length) throw error;
      await sleep(delaysSeconds[attempt]! * 1000);
    }
  }
}
