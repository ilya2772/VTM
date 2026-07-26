// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { FixedWindowRateLimiter } from "./rate-limit";

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
});
