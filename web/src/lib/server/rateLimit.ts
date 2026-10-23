/** Tiny in-memory token bucket. Fine for one instance; swap for Redis (e.g. Upstash) when horizontally scaled. */
const buckets = new Map<string, { tokens: number; at: number }>();

export function rateLimit(key: string, { limit = 10, windowMs = 10_000 } = {}): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: limit, at: now };
  const refill = ((now - b.at) / windowMs) * limit;
  b.tokens = Math.min(limit, b.tokens + refill);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return { ok: false, retryAfterMs: Math.ceil(((1 - b.tokens) / limit) * windowMs) };
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return { ok: true, retryAfterMs: 0 };
}
