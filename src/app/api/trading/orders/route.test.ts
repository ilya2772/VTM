// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthoritativeTick: vi.fn(),
  placeOrder: vi.fn(),
  previewOrder: vi.fn(),
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
  cancelOrder: vi.fn(),
  placeOrder: mocks.placeOrder,
  previewOrder: mocks.previewOrder,
}));

import { NextRequest } from "next/server";

import { POST as placePost } from "@/app/api/trading/orders/route";
import { POST as previewPost } from "@/app/api/trading/orders/preview/route";

const preview = {
  quantity: "0.01480813275",
  expectedExecutionPrice: "67527",
  notional: "999.99999998",
  initialMargin: "199.99999999",
  fee: "0.5",
  liquidationPrice: "54293.06532663",
  potentialProfit: null,
  potentialLoss: null,
  riskReward: null,
  orderStatus: "FILLED",
  priceSource: "DEMO",
} as const;

function orderRequest(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ticket = {
  accountId: "account-1",
  instrumentId: "instrument-1",
  type: "MARKET",
  side: "LONG",
  size: "1000",
  sizeUnit: "USD",
  leverage: "5",
} as const;

describe("order ticket routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthoritativeTick.mockResolvedValue({ symbol: "BTC/USD" });
    mocks.previewOrder.mockResolvedValue(preview);
    mocks.placeOrder.mockResolvedValue({
      order: { id: "order-1", status: "FILLED" },
      replayed: false,
    });
  });

  it("returns an authenticated server preview for USD sizing", async () => {
    const response = await previewPost(
      orderRequest("/api/trading/orders/preview", ticket),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(preview);
    expect(mocks.previewOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        size: "1000",
        sizeUnit: "USD",
      }),
      { symbol: "BTC/USD" },
      expect.any(Date),
    );
  });

  it("uses preview quantity and preserves the idempotency key on submit", async () => {
    const response = await placePost(
      orderRequest("/api/trading/orders", {
        ...ticket,
        idempotencyKey: "stable-key",
      }),
    );
    expect(response.status).toBe(201);
    expect(mocks.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "stable-key",
        quantity: preview.quantity,
        requestId: "request-1",
      }),
      { symbol: "BTC/USD" },
      expect.any(Date),
    );
  });

  it("rejects invalid ticket fields before market-data or execution calls", async () => {
    const response = await previewPost(
      orderRequest("/api/trading/orders/preview", {
        ...ticket,
        size: "0",
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.getAuthoritativeTick).not.toHaveBeenCalled();
    expect(mocks.previewOrder).not.toHaveBeenCalled();
  });
});
