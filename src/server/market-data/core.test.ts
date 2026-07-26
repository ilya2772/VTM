// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  aggregateTicks,
  assertExecutableTick,
  demoTick,
  isStale,
  normalizePythPrice,
  reconnectDelayMs,
  serializeTick,
} from "@/server/market-data";

describe("market-data normalization", () => {
  it("normalizes Pyth exponent, confidence, timestamp and status", () => {
    const tick = normalizePythPrice("BTC/USD", {
      price: "6750012",
      exponent: -2,
      confidence: "25",
      publishTime: 1_700_000_000,
      status: "trading",
    });
    expect(tick.price.toFixed(8)).toBe("67500.12000000");
    expect(tick.confidence.toFixed(8)).toBe("0.25000000");
    expect(tick.publishedAt.toISOString()).toBe("2023-11-14T22:13:20.000Z");
    expect(tick.status).toBe("TRADING");
  });

  it("marks a price stale only after the inclusive freshness window", () => {
    const tick = demoTick("BTC/USD", 0, new Date("2026-01-01T00:00:00Z"));
    expect(isStale(tick, new Date("2026-01-01T00:00:05Z"), 5000)).toBe(false);
    expect(isStale(tick, new Date("2026-01-01T00:00:05.001Z"), 5000)).toBe(
      true,
    );
    expect(() =>
      assertExecutableTick(tick, new Date("2026-01-01T00:00:06Z"), 5000),
    ).toThrow("stale");
  });

  it("aggregates ordered OHLC candles and removes duplicate ticks", () => {
    const a = demoTick("BTC/USD", 10, new Date("2026-01-01T00:00:01Z"));
    const b = demoTick("BTC/USD", 12, new Date("2026-01-01T00:00:20Z"));
    const c = demoTick("BTC/USD", 8, new Date("2026-01-01T00:01:01Z"));
    const candles = aggregateTicks([b, a, b, c], 60_000);
    expect(candles).toHaveLength(2);
    expect(candles[0]?.open.toFixed(8)).toBe("67500.00000000");
    expect(candles[0]?.high.toFixed(8)).toBe("67525.00000000");
    expect(candles[0]?.close.toFixed(8)).toBe("67525.00000000");
  });

  it("uses capped exponential reconnect backoff", () => {
    expect([0, 1, 2, 8].map((attempt) => reconnectDelayMs(attempt))).toEqual([
      500, 1000, 2000, 30000,
    ]);
  });

  it("produces deterministic, explicitly labelled demo data with unavailable fields", () => {
    const time = new Date("2026-01-01T00:00:00Z");
    const first = serializeTick(demoTick("ETH/USD", 7, time), "DEMO");
    const second = serializeTick(demoTick("ETH/USD", 7, time), "DEMO");
    expect(first).toEqual(second);
    expect(first.source).toBe("DEMO");
    expect(first.connection).toBe("DEMO");
    expect(first.volume).toBeNull();
    expect(first.fundingRate).toBeNull();
    expect(first.openInterest).toBeNull();
  });
});
