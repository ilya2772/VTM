import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "./page";

const terminalState = {
  user: {
    id: "demo-user",
    email: "demo@axiom.local",
    displayName: "Demo Trader",
  },
  account: {
    id: "demo-account",
    status: "ACTIVE",
    currency: "USDT",
    initialBalance: "50000",
    balance: "50000",
    equity: "50000",
    unrealizedPnl: "0",
  },
  challenge: {
    id: "demo-challenge",
    status: "ACTIVE",
    peakEquity: "50000",
    dailyStartingEquity: "50000",
    tradingDays: 0,
    rules: {
      profitTargetPct: "10",
      maxDailyLossPct: "5",
      maxOverallLossPct: "10",
      minTradingDays: 3,
      timezone: "UTC",
      maxLeverage: "10",
    },
    violations: [],
  },
  instruments: [
    {
      id: "btc",
      symbol: "BTC/USD",
      displayName: "Bitcoin / US Dollar",
      baseAsset: "BTC",
      quoteAsset: "USD",
      source: "DEMO",
    },
  ],
  positions: [],
  risk: { dailyDrawdownPct: "0", overallDrawdownPct: "0" },
  orders: [],
  trades: [],
  serverTime: "2026-07-26T12:00:00.000Z",
} as const;

class MockEventSource {
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {}
  addEventListener(type: string, listener: EventListener) {
    if (type === "tick") {
      queueMicrotask(() =>
        listener(
          new MessageEvent("tick", {
            data: JSON.stringify({
              symbol: "BTC/USD",
              price: "67500",
              confidence: "0.5",
              publishedAt: "2026-07-26T12:00:00.000Z",
              source: "DEMO",
              status: "TRADING",
              connection: "DEMO",
              volume: null,
              fundingRate: null,
              openInterest: null,
            }),
          }),
        ),
      );
    }
  }
  close() {}
}

describe("HomePage", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.stubGlobal("EventSource", MockEventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(terminalState), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("renders server-backed account data and the public chart disclosure", async () => {
    render(<HomePage />);
    expect(await screen.findByText("AXIOM")).toBeInTheDocument();
    expect(screen.getAllByText("$50,000.00").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "TradingView public widget · reference chart only · execution uses Axiom demo feed",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1M" })).toBeInTheDocument();
  });

  it("switches order type and requires confirmation before submitting", async () => {
    render(<HomePage />);
    await screen.findByText("AXIOM");
    fireEvent.click(screen.getByRole("tab", { name: "LIMIT" }));
    expect(screen.getByLabelText("Limit price")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "MARKET" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Open Long" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Open Long" }));
    expect(
      screen.getByRole("dialog", { name: "Confirm LONG" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This is a simulated order. No exchange order or real-money transaction will occur.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the login panel when the server has no active session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 401 })),
    );
    render(<HomePage />);
    expect(
      await screen.findByRole("heading", { name: "Axiom Prop Terminal" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Открыть терминал" }),
    ).toBeInTheDocument();
  });
});
