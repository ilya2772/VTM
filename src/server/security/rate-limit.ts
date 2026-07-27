import "server-only";

import { ApiError } from "@/server/http/api-error";

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
    if (!current && this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey) this.entries.delete(oldestKey);
    }
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
  }
}

const globalForRateLimit = globalThis as unknown as {
  loginEmailRateLimiter?: FixedWindowRateLimiter;
  loginIpRateLimiter?: FixedWindowRateLimiter;
  tradingMutationRateLimiter?: FixedWindowRateLimiter;
  orderPreviewRateLimiter?: FixedWindowRateLimiter;
  preferenceMutationRateLimiter?: FixedWindowRateLimiter;
};

export const loginEmailRateLimiter =
  globalForRateLimit.loginEmailRateLimiter ??
  new FixedWindowRateLimiter(5, 15 * 60_000);
export const loginIpRateLimiter =
  globalForRateLimit.loginIpRateLimiter ??
  new FixedWindowRateLimiter(20, 15 * 60_000);
export const tradingMutationRateLimiter =
  globalForRateLimit.tradingMutationRateLimiter ??
  new FixedWindowRateLimiter(60, 60_000);
export const orderPreviewRateLimiter =
  globalForRateLimit.orderPreviewRateLimiter ??
  new FixedWindowRateLimiter(240, 60_000);
export const preferenceMutationRateLimiter =
  globalForRateLimit.preferenceMutationRateLimiter ??
  new FixedWindowRateLimiter(60, 60_000);

export function assertRateLimit(
  limiter: FixedWindowRateLimiter,
  key: string,
  now = Date.now(),
): RateLimitResult {
  const result = limiter.consume(key, now);
  if (!result.allowed) {
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Too many requests. Try again later.",
      {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Remaining": String(result.remaining),
      },
    );
  }
  return result;
}

if (process.env.NODE_ENV !== "production") {
  globalForRateLimit.loginEmailRateLimiter = loginEmailRateLimiter;
  globalForRateLimit.loginIpRateLimiter = loginIpRateLimiter;
  globalForRateLimit.tradingMutationRateLimiter = tradingMutationRateLimiter;
  globalForRateLimit.orderPreviewRateLimiter = orderPreviewRateLimiter;
  globalForRateLimit.preferenceMutationRateLimiter =
    preferenceMutationRateLimiter;
}
