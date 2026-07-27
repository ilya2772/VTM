// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ApiError } from "@/server/http/api-error";

import { assertRateLimit, FixedWindowRateLimiter } from "./rate-limit";

describe("FixedWindowRateLimiter", () => {
  it("blocks requests after the configured limit", () => {
    const limiter = new FixedWindowRateLimiter(2, 60_000);

    expect(limiter.consume("client", 1_000).allowed).toBe(true);
    expect(limiter.consume("client", 1_001).allowed).toBe(true);
    expect(limiter.consume("client", 1_002)).toMatchObject({
      allowed: false,
      remaining: 0,
    });
  });

  it("opens a new window after expiry", () => {
    const limiter = new FixedWindowRateLimiter(1, 1_000);

    expect(limiter.consume("client", 1_000).allowed).toBe(true);
    expect(limiter.consume("client", 1_500).allowed).toBe(false);
    expect(limiter.consume("client", 2_000).allowed).toBe(true);
  });

  it("keeps an existing bucket when capacity is full", () => {
    const limiter = new FixedWindowRateLimiter(2, 60_000, 2);
    limiter.consume("first", 1_000);
    limiter.consume("second", 1_001);

    expect(limiter.consume("first", 1_002)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
  });

  it("returns a structured retry response when the limit is exceeded", () => {
    const limiter = new FixedWindowRateLimiter(1, 60_000);
    assertRateLimit(limiter, "client", 1_000);

    try {
      assertRateLimit(limiter, "client", 1_001);
      expect.unreachable("rate limit should reject the request");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      if (!(error instanceof ApiError)) return;
      expect(error.status).toBe(429);
      expect(error.code).toBe("RATE_LIMITED");
      expect(new Headers(error.headers).get("Retry-After")).toBe("60");
    }
  });
});
