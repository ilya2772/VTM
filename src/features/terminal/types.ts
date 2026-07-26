export interface TerminalState {
  user: { id: string; email: string; displayName: string };
  account: {
    id: string;
    status: "ACTIVE" | "LOCKED" | "CLOSED";
    currency: string;
    initialBalance: string;
    balance: string;
    equity: string;
    unrealizedPnl: string;
  };
  challenge: null | {
    id: string;
    status: "ACTIVE" | "PASSED" | "FAILED";
    peakEquity: string;
    dailyStartingEquity: string;
    tradingDays: number;
    rules: null | {
      profitTargetPct: string;
      maxDailyLossPct: string;
      maxOverallLossPct: string;
      minTradingDays: number;
      timezone: string;
      maxLeverage: string;
    };
    violations: {
      id: string;
      type: string;
      message: string;
      blocksTrading: boolean;
    }[];
  };
  instruments: {
    id: string;
    symbol: string;
    displayName: string;
    baseAsset: string;
    quoteAsset: string;
    source: "PYTH" | "DEMO";
  }[];
  positions: {
    id: string;
    instrumentId: string;
    symbol: string;
    side: "LONG" | "SHORT";
    quantity: string;
    entryPrice: string;
    markPrice: string;
    leverage: string;
    liquidationPrice: string | null;
    stopLoss: string | null;
    takeProfit: string | null;
    unrealizedPnl: string;
  }[];
  risk: { dailyDrawdownPct: string; overallDrawdownPct: string };
  orders: {
    id: string;
    symbol: string;
    type: string;
    side: string;
    status: string;
    quantity: string;
    limitPrice: string | null;
    stopPrice: string | null;
  }[];
  trades: {
    id: string;
    symbol: string;
    action: string;
    side: string;
    quantity: string;
    realizedPnl: string;
    openedAt: string;
    closedAt: string | null;
  }[];
  serverTime: string;
}

export interface StreamTick {
  symbol: string;
  price: string;
  confidence: string;
  publishedAt: string;
  source: "DEMO" | "PYTH";
  status: string;
  connection: "LIVE" | "DEMO" | "RECONNECTING" | "STALE" | "ERROR";
  volume: null;
  fundingRate: null;
  openInterest: null;
}
