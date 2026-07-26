import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("@/features/terminal/components/chart-provider-view", () => ({
  ChartProviderView: () => (
    <div>
      DEMO DATA · Lightweight Charts fallback · drawings and advanced indicators
      unavailable
    </div>
  ),
}));

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
  watchlistInstrumentIds: [],
  chartLayout: null,
  leaderboard: [
    {
      userId: "demo-user",
      displayName: "Demo Trader",
      returnPct: "0",
      realizedPnl: "0",
      challengeStatus: "ACTIVE",
    },
  ],
  serverTime: "2026-07-26T12:00:00.000Z",
} as const;

const orderPreview = {
  quantity: "0.01480813275",
  expectedExecutionPrice: "67527",
  notional: "1000",
  initialMargin: "1000",
  fee: "0.5",
  liquidationPrice: null,
  potentialProfit: null,
  potentialLoss: null,
  riskReward: null,
  orderStatus: "FILLED",
  priceSource: "DEMO",
} as const;

const managedTerminalState = {
  ...terminalState,
  positions: [
    {
      id: "position-1",
      instrumentId: "btc",
      symbol: "BTC/USD",
      side: "LONG",
      quantity: "0.01",
      entryPrice: "67000",
      markPrice: "67400",
      leverage: "5",
      liquidationPrice: "53869.34673367",
      stopLoss: "65000",
      takeProfit: "72000",
      unrealizedPnl: "4",
    },
  ],
  orders: [
    {
      id: "order-1",
      symbol: "BTC/USD",
      type: "LIMIT",
      side: "LONG",
      status: "OPEN",
      quantity: "0.01",
      limitPrice: "65000",
      stopPrice: null,
    },
  ],
  trades: [
    {
      id: "trade-1",
      symbol: "BTC/USD",
      action: "OPEN",
      side: "LONG",
      quantity: "0.01",
      realizedPnl: "0",
      entryPrice: "67000",
      exitPrice: null,
      fees: "0.5",
      openedAt: "2026-07-26T12:00:00.000Z",
      closedAt: null,
    },
  ],
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
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/trading/orders/preview")
          return new Response(JSON.stringify(orderPreview), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        return new Response(JSON.stringify(terminalState), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
  });

  afterAll(() => vi.unstubAllGlobals());

  it("renders server-backed account data and the fallback chart disclosure", async () => {
    render(<HomePage />);
    expect(await screen.findByText("AXIOM")).toBeInTheDocument();
    expect(screen.getAllByText("$50,000.00").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "DEMO DATA · Lightweight Charts fallback · drawings and advanced indicators unavailable",
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

  it("supports asset sizing, SL/TP fields and server preview details", async () => {
    render(<HomePage />);
    await screen.findByText("AXIOM");
    fireEvent.change(screen.getByLabelText("Size unit"), {
      target: { value: "ASSET" },
    });
    expect(screen.getByText("Size (BTC)")).toBeInTheDocument();
    expect(screen.getByLabelText("Stop Loss")).toBeInTheDocument();
    expect(screen.getByLabelText("Take Profit")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Open Long" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Open Long" }));
    expect(screen.getByText("Asset quantity")).toBeInTheDocument();
    expect(screen.getAllByText("Fee / margin").length).toBeGreaterThan(0);
    expect(screen.getByText("Server outcome")).toBeInTheDocument();
  });

  it("shows live position metrics and manages SL/TP plus partial close", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/trading/orders/preview")
          return new Response(JSON.stringify(orderPreview), { status: 200 });
        if (url === "/api/trading/positions" && init?.method === "PATCH")
          return new Response(
            JSON.stringify({
              positionId: "position-1",
              stopLoss: "65500",
              takeProfit: "72500",
            }),
            { status: 200 },
          );
        if (url === "/api/trading/positions/close")
          return new Response(
            JSON.stringify({ orderId: "close-1", status: "FILLED" }),
            { status: 201 },
          );
        return new Response(JSON.stringify(managedTerminalState), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<HomePage />);
    const position = await screen.findByRole("article", {
      name: "LONG position BTC/USD",
    });
    expect(
      within(position).getByText("Live unrealized PnL"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(position).getByText("+$5.00 · 3.73%")).toBeInTheDocument(),
    );
    fireEvent.click(
      within(position).getByRole("button", { name: "Edit SL/TP" }),
    );
    fireEvent.change(
      within(position).getByLabelText("Edit Stop Loss for LONG"),
      {
        target: { value: "65500" },
      },
    );
    fireEvent.change(
      within(position).getByLabelText("Edit Take Profit for LONG"),
      { target: { value: "72500" } },
    );
    fireEvent.click(
      within(position).getByRole("button", { name: "Save SL/TP" }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trading/positions",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
    await screen.findByText("Защитные уровни позиции обновлены.");
    fireEvent.click(within(position).getByRole("button", { name: "25%" }));
    expect(
      within(position).getByLabelText("Close quantity for LONG"),
    ).toHaveValue("0.0025");
    fireEvent.click(
      within(position).getByRole("button", { name: "Close quantity" }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trading/positions/close",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"quantity":"0.0025"'),
        }),
      ),
    );
    await screen.findByText("Позиция частично закрыта.");
  });

  it("shows order details and invokes cancellation", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (
          String(input) === "/api/trading/orders" &&
          init?.method === "DELETE"
        )
          return new Response(null, { status: 204 });
        if (String(input) === "/api/trading/orders/preview")
          return new Response(JSON.stringify(orderPreview), { status: 200 });
        return new Response(JSON.stringify(managedTerminalState), {
          status: 200,
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<HomePage />);
    await screen.findByText("AXIOM");
    fireEvent.click(screen.getByRole("tab", { name: "Orders" }));
    expect(screen.getByText(/LIMIT · OPEN · qty 0.01/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trading/orders",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("opens every product workspace and persists watchlist and settings", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (
          String(input) === "/api/terminal/preferences" &&
          init?.method === "PUT"
        )
          return new Response(JSON.stringify({ saved: true }), { status: 200 });
        if (String(input) === "/api/trading/orders/preview")
          return new Response(JSON.stringify(orderPreview), { status: 200 });
        return new Response(JSON.stringify(terminalState), { status: 200 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<HomePage />);
    await screen.findByText("AXIOM");
    for (const name of [
      "Dashboard",
      "Markets",
      "Watchlist",
      "Journal",
      "Leaderboard",
      "Analytics",
      "Settings",
    ] as const) {
      fireEvent.click(screen.getAllByRole("button", { name })[0]!);
      expect(
        screen.getByRole("region", { name: `${name} workspace` }),
      ).toBeInTheDocument();
    }
    fireEvent.click(screen.getAllByRole("button", { name: "Markets" })[0]!);
    fireEvent.click(
      screen.getByRole("button", { name: "Add BTC/USD to watchlist" }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/terminal/preferences",
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining('"kind":"WATCHLIST"'),
        }),
      ),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Settings" })[0]!);
    fireEvent.change(screen.getByLabelText("Theme"), {
      target: { value: "light" },
    });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/terminal/preferences",
        expect.objectContaining({
          body: expect.stringContaining('"kind":"CHART_LAYOUT"'),
        }),
      ),
    );
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
