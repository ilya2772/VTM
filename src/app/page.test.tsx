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

vi.mock("@/features/terminal/components/tradingview-widget", () => ({
  TradingViewWidget: ({ symbol }: { symbol: string }) => (
    <div>TradingView tools · PYTH:{symbol.replace("/", "")} market data</div>
  ),
}));

import HomePage from "./page";

const terminalState = {
  marketDataMode: "DEMO",
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
    {
      id: "eth",
      symbol: "ETH/USD",
      displayName: "Ether / US Dollar",
      baseAsset: "ETH",
      quoteAsset: "USD",
      source: "DEMO",
    },
    {
      id: "sol",
      symbol: "SOL/USD",
      displayName: "Solana / US Dollar",
      baseAsset: "SOL",
      quoteAsset: "USD",
      source: "DEMO",
    },
    {
      id: "xrp",
      symbol: "XRP/USD",
      displayName: "XRP / US Dollar",
      baseAsset: "XRP",
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
      markAvailable: true,
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
      stopLoss: "64000",
      takeProfit: "71000",
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
      const symbol = new URL(this.url, "http://localhost").searchParams.get(
        "symbol",
      );
      const prices: Record<string, string> = {
        "BTC/USD": "67500",
        "ETH/USD": "3500",
        "SOL/USD": "175",
        "XRP/USD": "0.62",
      };
      queueMicrotask(() =>
        listener(
          new MessageEvent("tick", {
            data: JSON.stringify({
              symbol,
              price: symbol ? prices[symbol] : "0",
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

  it("renders server-backed account data and the TradingView PYTH chart", async () => {
    render(<HomePage />);
    expect(await screen.findByText("AXIOM")).toBeInTheDocument();
    expect(screen.getAllByText("$50,000.00").length).toBeGreaterThan(0);
    expect(
      screen.getByText("TradingView tools · PYTH:BTCUSD market data"),
    ).toBeInTheDocument();
    expect(await screen.findByText("DEMO")).toBeInTheDocument();
    expect(screen.queryByText(/SIM \$/)).not.toBeInTheDocument();
    for (const symbol of ["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD"])
      expect(
        screen.getByRole("button", { name: new RegExp(`^${symbol}`) }),
      ).toBeInTheDocument();
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

  it("shows server-previewed loss and profit next to the entered targets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/trading/orders/preview")
          return new Response(
            JSON.stringify({
              ...orderPreview,
              potentialLoss: "-37.41",
              potentialProfit: "66.24",
            }),
            { status: 200 },
          );
        return new Response(JSON.stringify(terminalState), { status: 200 });
      }),
    );

    render(<HomePage />);
    await screen.findByText("AXIOM");
    fireEvent.change(screen.getByLabelText("Stop Loss"), {
      target: { value: "65000" },
    });
    fireEvent.change(screen.getByLabelText("Take Profit"), {
      target: { value: "72000" },
    });

    expect(
      await screen.findByText("Possible loss (LONG): -$37.41"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Potential profit (LONG): +$66.24"),
    ).toBeInTheDocument();
  });

  it("sizes orders from available margin and shows negative challenge progress", async () => {
    const stateWithLoss = {
      ...terminalState,
      account: {
        ...terminalState.account,
        balance: "49500",
        equity: "48000",
        unrealizedPnl: "-1500",
      },
      positions: [
        {
          id: "position-margin",
          instrumentId: "btc",
          symbol: "BTC/USD",
          side: "LONG",
          quantity: "0.1",
          entryPrice: "50000",
          markPrice: "48000",
          markAvailable: true,
          leverage: "5",
          liquidationPrice: "40000",
          stopLoss: null,
          takeProfit: null,
          unrealizedPnl: "-200",
        },
      ],
    } as const;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/trading/orders/preview")
          return new Response(JSON.stringify(orderPreview), { status: 200 });
        return new Response(JSON.stringify(stateWithLoss), { status: 200 });
      }),
    );

    render(<HomePage />);
    await screen.findByText("AXIOM");
    expect(screen.getByText("$47,000.00")).toBeInTheDocument();
    expect(screen.getByText("-40.00%")).toHaveClass("red");
    expect(
      screen.queryByRole("button", { name: "Set position size to 10%" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Set position size to 25%" }),
    );
    expect(screen.getByLabelText("Order size")).toHaveValue("11750.00");

    fireEvent.change(screen.getByLabelText("Position size percentage"), {
      target: { value: "50" },
    });
    expect(screen.getByLabelText("Order size")).toHaveValue("23500.00");
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

  it("switches chart, price feed and trade form from the Markets section", async () => {
    render(<HomePage />);
    await screen.findByText("AXIOM");
    fireEvent.click(screen.getByRole("button", { name: /^ETHUSD/ }));
    expect(
      screen.getByText("TradingView tools · PYTH:ETHUSD market data"),
    ).toBeInTheDocument();
    expect(screen.getByText("Size (USD)")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Size unit"), {
      target: { value: "ASSET" },
    });
    expect(screen.getByText("Size (ETH)")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("$3,500.00")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
    expect(
      screen.getByRole("region", { name: "Dashboard workspace" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Trade" }));
    expect(
      screen.getByRole("region", { name: "Торговый терминал" }),
    ).toBeInTheDocument();
  });

  it("shows the server-backed portfolio with positions, orders and history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/trading/orders/preview")
          return new Response(JSON.stringify(orderPreview), { status: 200 });
        return new Response(JSON.stringify(managedTerminalState), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    render(<HomePage />);
    await screen.findByText("AXIOM");
    fireEvent.click(screen.getByRole("button", { name: "Portfolio" }));

    expect(
      screen.getByRole("region", { name: "Portfolio workspace" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Portfolio value" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Demo portfolio")).toBeInTheDocument();
    expect(screen.getByText("Unrealized PnL")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /^Orders/ }));
    const portfolioPanel = screen.getByRole("tabpanel");
    expect(within(portfolioPanel).getByText("Quantity")).toBeInTheDocument();
    expect(within(portfolioPanel).getByText("$65,000.00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /^History/ }));
    expect(
      within(portfolioPanel).getByText("Realized PnL"),
    ).toBeInTheDocument();
    expect(within(portfolioPanel).getByText("Open")).toBeInTheDocument();
  });

  it("shows a stale feed explicitly and blocks new orders", async () => {
    class StaleEventSource extends MockEventSource {
      override addEventListener(type: string, listener: EventListener) {
        if (type !== "tick") return;
        queueMicrotask(() =>
          listener(
            new MessageEvent("tick", {
              data: JSON.stringify({
                symbol: "BTC/USD",
                price: "67500",
                confidence: "0.5",
                publishedAt: "2026-07-26T11:00:00.000Z",
                source: "PYTH",
                status: "TRADING",
                connection: "STALE",
                volume: null,
                fundingRate: null,
                openInterest: null,
              }),
            }),
          ),
        );
      }
    }
    vi.stubGlobal("EventSource", StaleEventSource);
    render(<HomePage />);
    await screen.findByText("AXIOM");
    expect((await screen.findAllByText("STALE")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Open Long" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open Short" })).toBeDisabled();
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
