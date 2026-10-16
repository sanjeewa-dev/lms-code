import { env } from '../config/env';
import { serviceUnavailable } from '../utils/httpError';

let active = 0;

/** Fail fast when this worker already has too many provider calls in flight. */
export async function withAiConcurrency<T>(fn: () => Promise<T>): Promise<T> {
  const max = env.aiMaxConcurrent ?? 8;
  if (active >= max) {
    throw serviceUnavailable('AI service is busy. Retry shortly.');
  }
  active += 1;
  try {
    return await fn();
  } finally {
    active = Math.max(0, active - 1);
  }
}
