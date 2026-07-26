// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  instrumentFindFirst: vi.fn(),
  watchlistUpsert: vi.fn(),
  watchlistDeleteMany: vi.fn(),
  chartLayoutUpsert: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/session", () => ({
  requireSession: vi.fn(async () => ({ user: { id: "user-1" } })),
}));
vi.mock("@/server/security/csrf", () => ({ assertSameOrigin: vi.fn() }));
vi.mock("@/server/security/request-context", () => ({
  getRequestContext: vi.fn(() => ({ requestId: "request-1" })),
}));
vi.mock("@/server/db/client", () => ({
  prisma: {
    instrument: { findFirst: mocks.instrumentFindFirst },
    watchlist: {
      upsert: mocks.watchlistUpsert,
      deleteMany: mocks.watchlistDeleteMany,
    },
    chartLayout: { upsert: mocks.chartLayoutUpsert },
  },
}));

import { NextRequest } from "next/server";
import { PUT } from "./route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/terminal/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("terminal preferences route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.instrumentFindFirst.mockResolvedValue({
      id: "btc",
      symbol: "BTC/USD",
    });
    mocks.watchlistUpsert.mockResolvedValue({ id: "watch-1" });
    mocks.chartLayoutUpsert.mockResolvedValue({ id: "layout-1" });
  });

  it("persists an authenticated watchlist change", async () => {
    const response = await PUT(
      request({ kind: "WATCHLIST", instrumentId: "btc", enabled: true }),
    );
    expect(response.status).toBe(200);
    expect(mocks.watchlistUpsert).toHaveBeenCalledOnce();
  });

  it("persists a validated chart layout", async () => {
    const response = await PUT(
      request({
        kind: "CHART_LAYOUT",
        symbol: "BTC/USD",
        timeframe: "15m",
        chartType: "Candles",
        theme: "dark",
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.chartLayoutUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ timeframe: "15m" }),
      }),
    );
  });

  it("rejects unsupported settings", async () => {
    const response = await PUT(
      request({
        kind: "CHART_LAYOUT",
        symbol: "BTC/USD",
        timeframe: "3m",
        chartType: "Fake",
        theme: "dark",
      }),
    );
    expect(response.status).toBe(400);
  });
});
