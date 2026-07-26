import "server-only";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = Readonly<{
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}>;

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxEntries = 10_000,
  ) {
    if (limit < 1 || windowMs < 1 || maxEntries < 1) {
      throw new Error("Rate limiter values must be positive.");
    }
  }

  consume(key: string, now = Date.now()): RateLimitResult {
    this.prune(now);

    const current = this.entries.get(key);
    const entry =
      current && current.resetAt > now
        ? current
        : { count: 0, resetAt: now + this.windowMs };

    entry.count += 1;
    this.entries.set(key, entry);

    return {
      allowed: entry.count <= this.limit,
      remaining: Math.max(0, this.limit - entry.count),
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1_000)),
    };
  }

  reset(key: string) {
    this.entries.delete(key);
  }

  private prune(now: number) {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) {
        this.entries.delete(key);
      }
    }

    while (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.entries.delete(oldestKey);
    }
  }
}

const globalForRateLimit = globalThis as unknown as {
  loginRateLimiter?: FixedWindowRateLimiter;
};

export const loginRateLimiter =
  globalForRateLimit.loginRateLimiter ??
  new FixedWindowRateLimiter(5, 15 * 60_000);

if (process.env.NODE_ENV !== "production") {
  globalForRateLimit.loginRateLimiter = loginRateLimiter;
}
