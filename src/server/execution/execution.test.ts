// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import * as execution from "@/server/execution";

describe("execution calculations", () => {
  it("calculates profitable and losing Long PnL", () => {
    expect(
      execution
        .calculatePnl({
          side: "LONG",
          quantity: "0.25",
          entryPrice: "100",
          exitPrice: "110",
        })
        .toFixed(8),
    ).toBe("2.50000000");
    expect(
      execution
        .calculatePnl({
          side: "LONG",
          quantity: "0.25",
          entryPrice: "100",
          exitPrice: "90",
        })
        .toFixed(8),
    ).toBe("-2.50000000");
  });

  it("calculates profitable and losing Short PnL", () => {
    expect(
      execution
        .calculatePnl({
          side: "SHORT",
          quantity: "0.25",
          entryPrice: "100",
          exitPrice: "90",
        })
        .toFixed(8),
    ).toBe("2.50000000");
    expect(
      execution
        .calculatePnl({
          side: "SHORT",
          quantity: "0.25",
          entryPrice: "100",
          exitPrice: "110",
        })
        .toFixed(8),
    ).toBe("-2.50000000");
  });

  it("applies maker and taker fee rates to unrounded notional", () => {
    expect(
      execution
        .calculateFee({ quantity: "2", price: "1000", feeBps: "2" })
        .toFixed(8),
    ).toBe("0.40000000");
    expect(
      execution
        .calculateFee({ quantity: "2", price: "1000", feeBps: "5" })
        .toFixed(8),
    ).toBe("1.00000000");
  });

  it("rounds money half-up to eight decimal places", () => {
    expect(
      execution
        .calculateFee({ quantity: "1", price: "1", feeBps: "0.00005" })
        .toFixed(8),
    ).toBe("0.00000001");
  });

  it("applies half-spread and slippage adversely", () => {
    expect(
      execution
        .simulateExecutionPrice({
          side: "BUY",
          oraclePrice: "100",
          spreadBps: "10",
          slippageBps: "3",
        })
        .toFixed(8),
    ).toBe("100.08000000");
    expect(
      execution
        .simulateExecutionPrice({
          side: "SELL",
          oraclePrice: "100",
          spreadBps: "10",
          slippageBps: "3",
        })
        .toFixed(8),
    ).toBe("99.92000000");
  });

  it("calculates initial margin", () => {
    expect(
      execution
        .calculateInitialMargin({
          quantity: "2",
          price: "100",
          leverage: "10",
        })
        .toFixed(8),
    ).toBe("20.00000000");
  });

  it("calculates Long and Short liquidation boundaries", () => {
    expect(
      execution
        .calculateLiquidationPrice({
          side: "LONG",
          entryPrice: "100",
          leverage: "10",
          maintenanceMarginRate: "0.005",
        })
        .toFixed(8),
    ).toBe("90.45226131");
    expect(
      execution
        .calculateLiquidationPrice({
          side: "SHORT",
          entryPrice: "100",
          leverage: "10",
          maintenanceMarginRate: "0.005",
        })
        .toFixed(8),
    ).toBe("109.45273632");
  });

  it("rejects invalid liquidation configuration", () => {
    expect(() =>
      execution.calculateLiquidationPrice({
        side: "LONG",
        entryPrice: "100",
        leverage: "1",
        maintenanceMarginRate: "0.005",
      }),
    ).toThrow("leverage must be greater than one");
  });

  it("triggers SL, TP and liquidation at inclusive boundaries", () => {
    expect(
      execution.shouldTriggerExit({
        side: "LONG",
        trigger: "STOP_LOSS",
        markPrice: "90",
        triggerPrice: "90",
      }),
    ).toBe(true);
    expect(
      execution.shouldTriggerExit({
        side: "LONG",
        trigger: "TAKE_PROFIT",
        markPrice: "110",
        triggerPrice: "110",
      }),
    ).toBe(true);
    expect(
      execution.shouldTriggerExit({
        side: "SHORT",
        trigger: "LIQUIDATION",
        markPrice: "110",
        triggerPrice: "110",
      }),
    ).toBe(true);
    expect(
      execution.shouldTriggerExit({
        side: "SHORT",
        trigger: "TAKE_PROFIT",
        markPrice: "91",
        triggerPrice: "90",
      }),
    ).toBe(false);
  });

  it("closes part of a position and deducts the exit fee", () => {
    const result = execution.closePosition({
      side: "LONG",
      positionQuantity: "2",
      closeQuantity: "0.5",
      entryPrice: "100",
      exitPrice: "110",
      feeBps: "4",
    });

    expect(result.closedQuantity.toFixed(12)).toBe("0.500000000000");
    expect(result.remainingQuantity.toFixed(12)).toBe("1.500000000000");
    expect(result.grossPnl.toFixed(8)).toBe("5.00000000");
    expect(result.fee.toFixed(8)).toBe("0.02200000");
    expect(result.netPnl.toFixed(8)).toBe("4.97800000");
    expect(result.fullyClosed).toBe(false);
  });

  it("supports a full close and rejects an oversized close", () => {
    expect(
      execution.closePosition({
        side: "SHORT",
        positionQuantity: "1",
        closeQuantity: "1",
        entryPrice: "100",
        exitPrice: "90",
        feeBps: "0",
      }).fullyClosed,
    ).toBe(true);
    expect(() =>
      execution.closePosition({
        side: "LONG",
        positionQuantity: "1",
        closeQuantity: "1.01",
        entryPrice: "100",
        exitPrice: "110",
        feeBps: "4",
      }),
    ).toThrow("closeQuantity cannot exceed positionQuantity");
  });
});

describe("order rules", () => {
  it("executes Market orders immediately", () => {
    expect(execution.evaluateOrder({ type: "MARKET" })).toEqual({
      triggered: true,
      executable: true,
    });
  });

  it("executes Limit orders only at their limit or better", () => {
    expect(
      execution.evaluateOrder({
        type: "LIMIT",
        side: "BUY",
        marketPrice: "99",
        limitPrice: "100",
      }).executable,
    ).toBe(true);
    expect(
      execution.evaluateOrder({
        type: "LIMIT",
        side: "SELL",
        marketPrice: "99",
        limitPrice: "100",
      }).executable,
    ).toBe(false);
  });

  it("activates Stop Limit before applying its limit rule", () => {
    expect(
      execution.evaluateOrder({
        type: "STOP_LIMIT",
        side: "BUY",
        marketPrice: "104",
        stopPrice: "105",
        limitPrice: "106",
      }),
    ).toEqual({ triggered: false, executable: false });
    expect(
      execution.evaluateOrder({
        type: "STOP_LIMIT",
        side: "BUY",
        marketPrice: "105",
        stopPrice: "105",
        limitPrice: "106",
      }),
    ).toEqual({ triggered: true, executable: true });
    expect(
      execution.evaluateOrder({
        type: "STOP_LIMIT",
        side: "BUY",
        marketPrice: "107",
        stopPrice: "105",
        limitPrice: "106",
        previouslyTriggered: true,
      }),
    ).toEqual({ triggered: true, executable: false });
  });
});
