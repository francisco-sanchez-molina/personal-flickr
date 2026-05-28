import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientKey, consume } from "~/lib/rate-limit";

describe("consume — token bucket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Anchor the clock so `resetAt` math is predictable.
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to `max` hits in a window", () => {
    const key = `t1-${Math.random()}`;
    expect(consume(key, 3, 60_000).ok).toBe(true);
    expect(consume(key, 3, 60_000).ok).toBe(true);
    expect(consume(key, 3, 60_000).ok).toBe(true);
    // 4th hit blocked
    const blocked = consume(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.retryAfter).toBeLessThanOrEqual(60);
  });

  it("resets after the window elapses", () => {
    const key = `t2-${Math.random()}`;
    consume(key, 2, 1_000);
    consume(key, 2, 1_000);
    expect(consume(key, 2, 1_000).ok).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(1_001);

    const fresh = consume(key, 2, 1_000);
    expect(fresh.ok).toBe(true);
    expect(fresh.remaining).toBe(1);
  });

  it("buckets keys independently", () => {
    consume("alpha", 1, 60_000);
    expect(consume("alpha", 1, 60_000).ok).toBe(false);
    expect(consume("beta", 1, 60_000).ok).toBe(true);
  });

  it("`remaining` decrements with each hit", () => {
    const key = `t3-${Math.random()}`;
    expect(consume(key, 3, 60_000).remaining).toBe(2);
    expect(consume(key, 3, 60_000).remaining).toBe(1);
    expect(consume(key, 3, 60_000).remaining).toBe(0);
  });
});

describe("clientKey — IP extraction", () => {
  const make = (headers: Record<string, string>) =>
    new Request("http://example.test", { headers });

  it("prefers the first hop of x-forwarded-for", () => {
    const r = make({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" });
    expect(clientKey(r, null)).toBe("1.2.3.4");
  });

  it("trims whitespace from the XFF entry", () => {
    const r = make({ "x-forwarded-for": "   5.6.7.8   " });
    expect(clientKey(r, null)).toBe("5.6.7.8");
  });

  it("falls back to cf-connecting-ip when no XFF", () => {
    const r = make({ "cf-connecting-ip": "9.9.9.9" });
    expect(clientKey(r, null)).toBe("9.9.9.9");
  });

  it("falls back to the provided address when no headers", () => {
    expect(clientKey(make({}), "127.0.0.1")).toBe("127.0.0.1");
  });

  it("returns 'unknown' when nothing identifies the client", () => {
    expect(clientKey(make({}), null)).toBe("unknown");
  });
});
