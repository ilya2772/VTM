// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  countTradingDays,
  evaluateChallenge,
  tradingDateAt,
  type ChallengeEvaluationInput,
} from "@/server/risk";

const baseInput: ChallengeEvaluationInput = {
  status: "ACTIVE",
  completedAt: null,
  now: new Date("2026-07-26T12:00:00.000Z"),
  balance: "50000",
  unrealizedPnls: [],
  previousPeakEquity: "50000",
  dailyStartingEquity: "50000",
  dailyTradingDate: "2026-07-26",
  qualifyingTradeTimes: [],
  rules: {
    initialBalance: "50000",
    profitTargetPct: "10",
    maxDailyLossPct: "5",
    maxOverallLossPct: "10",
    minTradingDays: 3,
    timezone: "UTC",
    closePositionsOnBreach: false,
  },
};

describe("risk metrics", () => {
  it("calculates balance, equity, realized/unrealized PnL and peak equity", () => {
    const result = evaluateChallenge({
      ...baseInput,
      balance: "48000",
      unrealizedPnls: ["-700", "-300"],
      previousPeakEquity: "51000",
    });

    expect(result.balance.toFixed(8)).toBe("48000.00000000");
    expect(result.realizedPnl.toFixed(8)).toBe("-2000.00000000");
    expect(result.unrealizedPnl.toFixed(8)).toBe("-1000.00000000");
    expect(result.equity.toFixed(8)).toBe("47000.00000000");
    expect(result.peakEquity.toFixed(8)).toBe("51000.00000000");
    expect(result.dailyDrawdownPct.toFixed(8)).toBe("6.00000000");
    expect(result.overallDrawdownPct.toFixed(8)).toBe("6.00000000");
  });

  it("updates peak equity and never reports a negative drawdown", () => {
    const result = evaluateChallenge({
      ...baseInput,
      balance: "51000",
      previousPeakEquity: "50000",
    });

    expect(result.peakEquity.toFixed(8)).toBe("51000.00000000");
    expect(result.dailyDrawdownPct.toFixed(8)).toBe("0.00000000");
    expect(result.overallDrawdownPct.toFixed(8)).toBe("0.00000000");
    expect(result.profitPct.toFixed(8)).toBe("2.00000000");
  });
});

describe("daily boundaries and trading days", () => {
  it("resets daily starting equity on the first evaluation of a new UTC day", () => {
    const result = evaluateChallenge({
      ...baseInput,
      balance: "47000",
      dailyTradingDate: "2026-07-25",
    });

    expect(result.dailyReset).toBe(true);
    expect(result.tradingDate).toBe("2026-07-26");
    expect(result.dailyStartingEquity.toFixed(8)).toBe("47000.00000000");
    expect(result.dailyDrawdownPct.toFixed(8)).toBe("0.00000000");
    expect(result.overallDrawdownPct.toFixed(8)).toBe("6.00000000");
  });

  it("uses IANA timezone midnight instead of UTC midnight", () => {
    expect(
      tradingDateAt(new Date("2026-07-26T03:59:59.000Z"), "America/New_York"),
    ).toBe("2026-07-25");
    expect(
      tradingDateAt(new Date("2026-07-26T04:00:00.000Z"), "America/New_York"),
    ).toBe("2026-07-26");
  });

  it("counts distinct local dates with qualifying executions", () => {
    expect(
      countTradingDays(
        [
          new Date("2026-07-25T10:00:00.000Z"),
          new Date("2026-07-25T18:00:00.000Z"),
          new Date("2026-07-26T10:00:00.000Z"),
        ],
        "UTC",
      ),
    ).toBe(2);
  });

  it("rejects invalid timezone identifiers", () => {
    expect(() => tradingDateAt(baseInput.now, "Mars/Olympus")).toThrow(
      "timezone is not a valid IANA timezone",
    );
  });
});

describe("challenge lifecycle", () => {
  it("fails and records a daily loss at the inclusive threshold", () => {
    const result = evaluateChallenge({ ...baseInput, balance: "47500" });

    expect(result.status).toBe("FAILED");
    expect(result.completedAt?.toISOString()).toBe(baseInput.now.toISOString());
    expect(result.violations.map(({ type }) => type)).toContain("DAILY_LOSS");
    expect(result.blockNewOrders).toBe(true);
    expect(result.blockingReason).toContain("Daily loss limit reached");
  });

  it("fails on overall drawdown while daily loss remains below its limit", () => {
    const result = evaluateChallenge({
      ...baseInput,
      balance: "45000",
      dailyStartingEquity: "47000",
    });

    expect(result.dailyDrawdownPct.lt("5")).toBe(true);
    expect(result.overallDrawdownPct.toFixed(8)).toBe("10.00000000");
    expect(result.violations.map(({ type }) => type)).toEqual(["OVERALL_LOSS"]);
    expect(result.status).toBe("FAILED");
  });

  it("requests position closure only when the breach rule enables it", () => {
    expect(
      evaluateChallenge({
        ...baseInput,
        balance: "47500",
        rules: { ...baseInput.rules, closePositionsOnBreach: true },
      }).closeOpenPositions,
    ).toBe(true);
    expect(
      evaluateChallenge({ ...baseInput, balance: "47500" }).closeOpenPositions,
    ).toBe(false);
  });

  it("does not pass before the minimum trading days are complete", () => {
    const result = evaluateChallenge({
      ...baseInput,
      balance: "55000",
      qualifyingTradeTimes: [
        new Date("2026-07-25T10:00:00.000Z"),
        new Date("2026-07-26T10:00:00.000Z"),
      ],
    });

    expect(result.profitPct.toFixed(8)).toBe("10.00000000");
    expect(result.tradingDays).toBe(2);
    expect(result.status).toBe("ACTIVE");
    expect(result.blockNewOrders).toBe(false);
  });

  it("passes when profit target and minimum trading days are both met", () => {
    const result = evaluateChallenge({
      ...baseInput,
      balance: "55000",
      qualifyingTradeTimes: [
        new Date("2026-07-24T10:00:00.000Z"),
        new Date("2026-07-25T10:00:00.000Z"),
        new Date("2026-07-26T10:00:00.000Z"),
      ],
    });

    expect(result.status).toBe("PASSED");
    expect(result.tradingDays).toBe(3);
    expect(result.blockNewOrders).toBe(true);
    expect(result.blockingReason).toContain("Profit target");
  });

  it("keeps terminal status and completion timestamp immutable", () => {
    const completedAt = new Date("2026-07-25T12:00:00.000Z");
    const result = evaluateChallenge({
      ...baseInput,
      status: "FAILED",
      completedAt,
      balance: "55000",
    });

    expect(result.status).toBe("FAILED");
    expect(result.completedAt).toBe(completedAt);
    expect(result.violations).toEqual([]);
    expect(result.blockNewOrders).toBe(true);
  });
});
