/**
 * Tiny fixed-window rate limiter.
 *
 * Use case (today): brute-force defence on /api/auth/login. The window
 * pattern is intentionally simple — a per-key counter that resets at a
 * fixed deadline. It's not perfectly smooth (a user can do `max` attempts
 * right before the reset and `max` more right after, for `2×max` in a
 * narrow band) but for "5 attempts per minute on a single password" it
 * does what the README promises.
 *
 * State lives in-process. Single-instance Astro deploy: fine. If we ever
 * scale horizontally we'd swap this for Redis or a similar shared store —
 * keeping the API tight (`consume(key)` returns retry info) makes that
 * swap a one-file change.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
/** Periodic cleanup so old keys don't grow the map unboundedly. */
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 60_000;

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (b.resetAt < now) buckets.delete(k);
  }
}

export interface RateLimitResult {
  /** False when the caller has consumed all their quota in this window. */
  ok: boolean;
  /** Seconds until the current window resets; populated for both ok+blocked. */
  retryAfter: number;
  /** Hits remaining in this window (0 when blocked). */
  remaining: number;
}

/**
 * Consume 1 hit for `key`. Returns `{ ok: false }` when this hit would
 * exceed `max` within `windowMs`. The caller is responsible for surfacing
 * `retryAfter` to the client (HTTP 429 + `Retry-After` header).
 */
export function consume(
  key: string,
  max: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    // Start a fresh window with this hit already counted.
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return {
      ok: true,
      retryAfter: Math.ceil(windowMs / 1000),
      remaining: max - 1,
    };
  }
  if (bucket.count >= max) {
    return {
      ok: false,
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
      remaining: 0,
    };
  }
  bucket.count++;
  return {
    ok: true,
    retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
    remaining: max - bucket.count,
  };
}

/**
 * Best-effort client IP. Picks the first hop of `x-forwarded-for` when
 * present (Coolify / Cloudflare set this), then `cf-connecting-ip`, then
 * the fallback `address` argument that Astro provides on the context.
 *
 * Spoofable when there's no proxy between the user and us. Behind any
 * real proxy these headers reflect the original client.
 */
export function clientKey(
  request: Request,
  fallbackAddress: string | null,
): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  return fallbackAddress ?? "unknown";
}
