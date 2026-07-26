"use client";

import {
  chartResolutions,
  chartResolutionSeconds,
  type ChartBar,
  type ChartDatafeedConfiguration,
  type ChartPeriod,
  type ChartProviderContract,
  type ChartResolution,
  type ChartSymbol,
} from "@/shared/chart";

const symbols: readonly ChartSymbol[] = [
  {
    name: "BTC/USD",
    ticker: "BTC/USD",
    description: "Bitcoin / US Dollar — simulated market",
    type: "crypto",
    session: "24x7",
    timezone: "Etc/UTC",
    exchange: "AXIOM DEMO",
    minmov: 1,
    pricescale: 100,
    hasIntraday: true,
    supportedResolutions: chartResolutions,
  },
  {
    name: "ETH/USD",
    ticker: "ETH/USD",
    description: "Ethereum / US Dollar — simulated market",
    type: "crypto",
    session: "24x7",
    timezone: "Etc/UTC",
    exchange: "AXIOM DEMO",
    minmov: 1,
    pricescale: 100,
    hasIntraday: true,
    supportedResolutions: chartResolutions,
  },
];

const configuration: ChartDatafeedConfiguration = {
  supportedResolutions: chartResolutions,
  supportsSearch: true,
  supportsTime: true,
};

interface TickPayload {
  symbol: string;
  price: string;
  publishedAt: string;
}

interface Subscription {
  source: EventSource;
  lastBar: ChartBar | null;
  lastTickKey: string;
}

function isTickPayload(value: unknown): value is TickPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "symbol" in value &&
    "price" in value &&
    "publishedAt" in value &&
    typeof value.symbol === "string" &&
    typeof value.price === "string" &&
    typeof value.publishedAt === "string"
  );
}

export function mergeTickIntoBar(
  previous: ChartBar | null,
  price: number,
  publishedAtSeconds: number,
  resolution: ChartResolution,
): ChartBar {
  const interval = chartResolutionSeconds[resolution];
  const time = Math.floor(publishedAtSeconds / interval) * interval;
  if (!previous || previous.time !== time) {
    return { time, open: price, high: price, low: price, close: price };
  }
  return {
    ...previous,
    high: Math.max(previous.high, price),
    low: Math.min(previous.low, price),
    close: price,
  };
}

export class AxiomChartProvider implements ChartProviderContract {
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly lastBars = new Map<string, ChartBar>();

  private cacheKey(symbol: string, resolution: ChartResolution): string {
    return `${symbol}:${resolution}`;
  }

  onReady(callback: (value: ChartDatafeedConfiguration) => void): void {
    queueMicrotask(() => callback(configuration));
  }

  searchSymbols(
    query: string,
    callback: (matches: readonly ChartSymbol[]) => void,
  ): void {
    const normalized = query.trim().toLowerCase();
    callback(
      symbols.filter(
        (symbol) =>
          !normalized ||
          symbol.ticker.toLowerCase().includes(normalized) ||
          symbol.description.toLowerCase().includes(normalized),
      ),
    );
  }

  resolveSymbol(
    requested: string,
    onResolved: (symbol: ChartSymbol) => void,
    onError: (message: string) => void,
  ): void {
    const match = symbols.find(
      (symbol) => symbol.ticker.toLowerCase() === requested.toLowerCase(),
    );
    if (match) onResolved(match);
    else onError(`Unknown simulated symbol: ${requested}`);
  }

  getBars(
    symbol: ChartSymbol,
    resolution: ChartResolution,
    period: ChartPeriod,
    onHistory: (bars: readonly ChartBar[], noData: boolean) => void,
    onError: (message: string) => void,
  ): void {
    const query = new URLSearchParams({
      symbol: symbol.ticker,
      resolution,
      from: String(period.from),
      to: String(period.to),
      countBack: String(period.countBack ?? 300),
    });
    void fetch(`/api/market/history?${query}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`History request failed (${response.status}).`);
        const payload: unknown = await response.json();
        if (
          typeof payload !== "object" ||
          payload === null ||
          !("bars" in payload) ||
          !Array.isArray(payload.bars)
        ) {
          throw new Error("History response is invalid.");
        }
        const bars = payload.bars.filter(isChartBar);
        const lastBar = bars.at(-1);
        if (lastBar)
          this.lastBars.set(this.cacheKey(symbol.ticker, resolution), lastBar);
        onHistory(bars, bars.length === 0);
      })
      .catch((error: unknown) =>
        onError(
          error instanceof Error ? error.message : "History request failed.",
        ),
      );
  }

  subscribeBars(
    symbol: ChartSymbol,
    resolution: ChartResolution,
    onRealtime: (bar: ChartBar) => void,
    subscriberUid: string,
    onResetCache: () => void,
  ): void {
    this.unsubscribeBars(subscriberUid);
    const source = new EventSource(
      `/api/market/stream?symbol=${encodeURIComponent(symbol.ticker)}`,
    );
    const subscription: Subscription = {
      source,
      lastBar:
        this.lastBars.get(this.cacheKey(symbol.ticker, resolution)) ?? null,
      lastTickKey: "",
    };
    source.addEventListener("tick", (event) => {
      try {
        const payload: unknown = JSON.parse(
          (event as MessageEvent<string>).data,
        );
        if (!isTickPayload(payload) || payload.symbol !== symbol.ticker) return;
        const price = Number(payload.price);
        const publishedAt = Date.parse(payload.publishedAt) / 1000;
        if (!Number.isFinite(price) || !Number.isSafeInteger(publishedAt))
          return;
        const tickKey = `${payload.publishedAt}:${payload.price}`;
        if (tickKey === subscription.lastTickKey) return;
        subscription.lastTickKey = tickKey;
        subscription.lastBar = mergeTickIntoBar(
          subscription.lastBar,
          price,
          publishedAt,
          resolution,
        );
        onRealtime(subscription.lastBar);
      } catch {
        onResetCache();
      }
    });
    source.onerror = onResetCache;
    this.subscriptions.set(subscriberUid, subscription);
  }

  unsubscribeBars(subscriberUid: string): void {
    const subscription = this.subscriptions.get(subscriberUid);
    subscription?.source.close();
    this.subscriptions.delete(subscriberUid);
  }

  destroy(): void {
    for (const subscriberUid of this.subscriptions.keys())
      this.unsubscribeBars(subscriberUid);
    this.lastBars.clear();
  }
}

function isChartBar(value: unknown): value is ChartBar {
  if (typeof value !== "object" || value === null) return false;
  return (
    "time" in value &&
    "open" in value &&
    "high" in value &&
    "low" in value &&
    "close" in value &&
    typeof value.time === "number" &&
    typeof value.open === "number" &&
    typeof value.high === "number" &&
    typeof value.low === "number" &&
    typeof value.close === "number"
  );
}
