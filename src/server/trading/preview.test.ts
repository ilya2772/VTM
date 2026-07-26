// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { demoTick } from "@/server/market-data";
import { calculateOrderPreview } from "@/server/trading/preview";

const now = new Date("2026-07-26T12:00:00.000Z");
const tick = demoTick("BTC/USD", 10, now);
const limits = {
  balance: "50000",
  maxLeverage: "10",
  maxPositionNotional: "250000",
};

describe("order preview", () => {
  it("converts USD size authoritatively and previews Long risk values", () => {
    const preview = calculateOrderPreview(
      {
        type: "MARKET",
        side: "LONG",
        size: "1000",
        sizeUnit: "USD",
        leverage: "5",
        stopLoss: "65000",
        takeProfit: "72000",
      },
      tick,
      limits,
      now,
    );
    expect(preview.expectedExecutionPrice).toBe("67527");
    expect(Number(preview.notional)).toBeCloseTo(1000, 6);
    expect(Number(preview.initialMargin)).toBeCloseTo(200, 6);
    expect(Number(preview.fee)).toBeCloseTo(0.5, 6);
    expect(Number(preview.quantity)).toBeGreaterThan(0);
    expect(Number(preview.potentialLoss)).toBeLessThan(0);
    expect(Number(preview.potentialProfit)).toBeGreaterThan(0);
    expect(Number(preview.riskReward)).toBeGreaterThan(1);
    expect(preview.liquidationPrice).not.toBeNull();
    expect(preview.orderStatus).toBe("FILLED");
  });

  it("preserves asset size and applies the Short execution direction", () => {
    const preview = calculateOrderPreview(
      {
        type: "LIMIT",
        side: "SHORT",
        size: "0.25",
        sizeUnit: "ASSET",
        leverage: "1",
        limitPrice: "68000",
      },
      tick,
      limits,
      now,
    );
    expect(preview.quantity).toBe("0.25");
    expect(Number(preview.expectedExecutionPrice)).toBeLessThan(67500);
    expect(preview.liquidationPrice).toBeNull();
    expect(preview.orderStatus).toBe("OPEN");
  });

  it("rejects inverted SL/TP and stale prices", () => {
    expect(() =>
      calculateOrderPreview(
        {
          type: "MARKET",
          side: "LONG",
          size: "1000",
          sizeUnit: "USD",
          leverage: "2",
          stopLoss: "70000",
          takeProfit: "65000",
        },
        tick,
        limits,
        now,
      ),
    ).toThrow("Long requires stop loss below");
    expect(() =>
      calculateOrderPreview(
        {
          type: "MARKET",
          side: "SHORT",
          size: "1",
          sizeUnit: "ASSET",
          leverage: "2",
        },
        tick,
        limits,
        new Date(now.getTime() + 5_001),
      ),
    ).toThrow("stale");
  });

  it("rejects leverage, notional and balance violations before submit", () => {
    expect(() =>
      calculateOrderPreview(
        {
          type: "MARKET",
          side: "LONG",
          size: "1",
          sizeUnit: "ASSET",
          leverage: "11",
        },
        tick,
        limits,
        now,
      ),
    ).toThrow("leverage");
    expect(() =>
      calculateOrderPreview(
        {
          type: "MARKET",
          side: "LONG",
          size: "100000",
          sizeUnit: "USD",
          leverage: "1",
        },
        tick,
        { ...limits, balance: "100" },
        now,
      ),
    ).toThrow("balance");
  });
});
