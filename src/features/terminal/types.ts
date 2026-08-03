export interface TerminalState {
  marketDataMode: "PYTH" | "DEMO" | "UNAVAILABLE";
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
    status:
      "PENDING_PAYMENT" | "READY" | "ACTIVE" | "PASSED" | "FAILED" | "EXPIRED";
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
    markAvailable: boolean;
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
    stopLoss: string | null;
    takeProfit: string | null;
  }[];
  trades: {
    id: string;
    symbol: string;
    action: string;
    side: string;
    quantity: string;
    realizedPnl: string;
    entryPrice: string;
    exitPrice: string | null;
    fees: string;
    openedAt: string;
    closedAt: string | null;
  }[];
  watchlistInstrumentIds: string[];
  chartLayout: null | {
    symbol: string;
    timeframe: string;
    engine: string;
    chartType: "Candles" | "Bars" | "Line" | "Area" | "Heikin Ashi";
    theme: "dark" | "light";
  };
  leaderboard: {
    userId: string;
    displayName: string;
    returnPct: string;
    realizedPnl: string;
    challengeStatus: "ACTIVE" | "PASSED" | "FAILED" | null;
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

export interface OrderPreview {
  quantity: string;
  expectedExecutionPrice: string;
  notional: string;
  initialMargin: string;
  fee: string;
  liquidationPrice: string | null;
  potentialProfit: string | null;
  potentialLoss: string | null;
  riskReward: string | null;
  orderStatus: "FILLED" | "OPEN";
  priceSource: "DEMO" | "PYTH";
  risk: {
    score: number;
    level: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
    blocked: boolean;
    factors: {
      code: string;
      label: string;
      penalty: string;
      severity: "INFO" | "WARNING" | "CRITICAL";
    }[];
  };
}
