import { describe, expect, it } from "vitest";

import { calculateRiskScore, type RiskScoreInput } from "./risk-score";

const safe: RiskScoreInput = {
  balance: "50000",
  equity: "50000",
  totalExposure: "1000",
  selectedAssetExposure: "1000",
  leverage: "1",
  maxLeverage: "10",
  orderNotional: "1000",
  potentialLoss: "100",
  hasStopLoss: true,
  dailyDrawdownPct: "0",
  maxDailyDrawdownPct: "5",
  overallDrawdownPct: "0",
  maxOverallDrawdownPct: "10",
  correlatedPositions: 0,
  blockingViolations: [],
};

describe("calculateRiskScore", () => {
  it("returns a high score for a small protected trade", () => {
    const result = calculateRiskScore(safe);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.level).toBe("LOW");
  });

  it("penalizes leverage, size, drawdown and missing stop loss", () => {
    const result = calculateRiskScore({
      ...safe,
      totalExposure: "45000",
      selectedAssetExposure: "45000",
      leverage: "10",
      orderNotional: "50000",
      potentialLoss: null,
      hasStopLoss: false,
      dailyDrawdownPct: "4.8",
      overallDrawdownPct: "9",
      correlatedPositions: 3,
    });
    expect(result.score).toBeLessThan(40);
    expect(result.factors.some((factor) => factor.code === "TRADE_RISK")).toBe(
      true,
    );
  });

  it("makes authoritative rule violations critical", () => {
    const result = calculateRiskScore({
      ...safe,
      blockingViolations: ["Daily loss limit breached"],
    });
    expect(result).toMatchObject({
      score: 0,
      blocked: true,
      level: "CRITICAL",
    });
  });
});
