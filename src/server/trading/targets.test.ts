// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { validateProtectiveTargets } from "@/server/trading/targets";

describe("protective position targets", () => {
  it("accepts Long and Short targets on the protective sides of the mark", () => {
    expect(() =>
      validateProtectiveTargets({
        side: "LONG",
        referencePrice: "100",
        stopLoss: "90",
        takeProfit: "120",
      }),
    ).not.toThrow();
    expect(() =>
      validateProtectiveTargets({
        side: "SHORT",
        referencePrice: "100",
        stopLoss: "110",
        takeProfit: "80",
      }),
    ).not.toThrow();
  });

  it("allows either target to be cleared", () => {
    expect(() =>
      validateProtectiveTargets({
        side: "LONG",
        referencePrice: "100",
        stopLoss: null,
        takeProfit: null,
      }),
    ).not.toThrow();
  });

  it("rejects targets that would already have triggered", () => {
    expect(() =>
      validateProtectiveTargets({
        side: "LONG",
        referencePrice: "100",
        stopLoss: "101",
      }),
    ).toThrow("Long requires stop loss below");
    expect(() =>
      validateProtectiveTargets({
        side: "SHORT",
        referencePrice: "100",
        takeProfit: "101",
      }),
    ).toThrow("Short requires stop loss above");
  });
});
