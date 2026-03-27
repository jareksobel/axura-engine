/**
 * In-process sliding-window rate limiter.
 *
 * ⚠️  In a serverless / multi-instance deployment this state is NOT shared
 *     between instances.  For production replace the store with an Upstash
 *     Redis counter:  https://github.com/upstash/ratelimit
 *
 * Configuration is driven by environment variables so limits can be tuned
 * per environment without code changes:
 *   RATE_LIMIT_MAX      – maximum requests in the window  (default 60)
 *   RATE_LIMIT_WINDOW   – window size in seconds          (default 60)
 */

interface WindowEntry {
  count: number;
  windowStart: number; // ms timestamp
}

const store = new Map<string, WindowEntry>();

const MAX     = parseInt(process.env.RATE_LIMIT_MAX    ?? '60',  10);
const WINDOW  = parseInt(process.env.RATE_LIMIT_WINDOW ?? '60',  10) * 1_000; // → ms

/**
 * Check whether the given key (typically an IP address) is within the rate
 * limit.  Returns `{ ok: true }` when the request may proceed, or
 * `{ ok: false, retryAfter: number }` when the limit is exceeded.
 */
export function checkRateLimit(key: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart >= WINDOW) {
    // Start a fresh window
    store.set(key, { count: 1, windowStart: now });
    return { ok: true };
  }

  if (entry.count >= MAX) {
    const retryAfter = Math.ceil((WINDOW - (now - entry.windowStart)) / 1_000);
    return { ok: false, retryAfter };
  }

  entry.count += 1;
  return { ok: true };
}

/**
 * Purge stale entries to prevent unbounded memory growth.
 * Call this on a timer (e.g. every 5 minutes) in long-lived processes.
 */
export function purgeExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.windowStart >= WINDOW) {
      store.delete(key);
    }
  }
}
