// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthoritativeTick: vi.fn(),
  updatePositionTargets: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/session", () => ({
  requireSession: vi.fn(async () => ({ user: { id: "user-1" } })),
}));
vi.mock("@/server/security/csrf", () => ({ assertSameOrigin: vi.fn() }));
vi.mock("@/server/security/request-context", () => ({
  getRequestContext: vi.fn(() => ({ requestId: "request-1" })),
}));
vi.mock("@/server/trading/price", () => ({
  getAuthoritativeTick: mocks.getAuthoritativeTick,
}));
vi.mock("@/server/trading/service", () => ({
  updatePositionTargets: mocks.updatePositionTargets,
}));

import { NextRequest } from "next/server";

import { PATCH } from "@/app/api/trading/positions/route";

function patchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/trading/positions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("position targets route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthoritativeTick.mockResolvedValue({ symbol: "BTC/USD" });
    mocks.updatePositionTargets.mockResolvedValue({
      id: "position-1",
      stopLoss: { toString: () => "65000" },
      takeProfit: { toString: () => "72000" },
    });
  });

  it("updates authenticated targets using an authoritative tick", async () => {
    const response = await PATCH(
      patchRequest({
        accountId: "account-1",
        instrumentId: "instrument-1",
        positionId: "position-1",
        stopLoss: "65000",
        takeProfit: "72000",
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      positionId: "position-1",
      stopLoss: "65000",
      takeProfit: "72000",
    });
    expect(mocks.updatePositionTargets).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        requestId: "request-1",
      }),
      { symbol: "BTC/USD" },
      expect.any(Date),
    );
  });

  it("supports clearing both targets and rejects an empty patch", async () => {
    mocks.updatePositionTargets.mockResolvedValue({
      id: "position-1",
      stopLoss: null,
      takeProfit: null,
    });
    const cleared = await PATCH(
      patchRequest({
        accountId: "account-1",
        instrumentId: "instrument-1",
        positionId: "position-1",
        stopLoss: null,
        takeProfit: null,
      }),
    );
    expect(cleared.status).toBe(200);
    const invalid = await PATCH(
      patchRequest({
        accountId: "account-1",
        instrumentId: "instrument-1",
        positionId: "position-1",
      }),
    );
    expect(invalid.status).toBe(400);
  });
});
