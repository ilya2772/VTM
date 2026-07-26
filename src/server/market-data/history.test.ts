// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { demoHistory } from "@/server/market-data/history";

describe("demo chart history", () => {
  it("returns ordered deterministic OHLC bars for every supported interval", () => {
    const bars = demoHistory("BTC/USD", "15m", 1_767_225_600, 1_767_227_400, 3);
    expect(bars).toHaveLength(3);
    expect(bars.map((bar) => bar.time)).toEqual([
      1_767_225_600, 1_767_226_500, 1_767_227_400,
    ]);
    expect(bars[0]?.high).toBeGreaterThanOrEqual(bars[0]?.low ?? Infinity);
    expect(
      demoHistory("BTC/USD", "15m", 1_767_225_600, 1_767_227_400, 3),
    ).toEqual(bars);
  });

  it("caps an oversized history request", () => {
    const bars = demoHistory("ETH/USD", "1m", 0, 100_000, 10_000);
    expect(bars).toHaveLength(500);
  });
});
