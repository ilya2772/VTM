import "server-only";

import {
  Decimal,
  decimal,
  positive,
  quantize,
  SCALE,
} from "@/server/execution";

export type MarketMode = "PYTH" | "DEMO";
export type ConnectionState =
  "LIVE" | "DEMO" | "RECONNECTING" | "STALE" | "ERROR";

export interface MarketTick {
  symbol: string;
  price: Decimal;
  confidence: Decimal;
  publishedAt: Date;
  source: MarketMode;
  status: "TRADING" | "HALTED" | "UNKNOWN";
}

export interface Candle {
  time: Date;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
}

export interface PythPricePayload {
  price: string;
  exponent: number;
  confidence: string;
  publishTime: number;
  status?: string;
}

function assertInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value))
    throw new Error(`${label} must be a safe integer`);
}

export function normalizePythPrice(
  symbol: string,
  payload: PythPricePayload,
): MarketTick {
  assertInteger(payload.exponent, "exponent");
  assertInteger(payload.publishTime, "publishTime");
  const factor = new Decimal(10).pow(payload.exponent);
  const price = quantize(
    decimal(payload.price, "price").mul(factor),
    SCALE.price,
  );
  const confidence = quantize(
    decimal(payload.confidence, "confidence").mul(factor),
    SCALE.price,
  );
  if (!price.isPositive() || confidence.isNegative())
    throw new Error("normalized Pyth values are invalid");
  const publishedAt = new Date(payload.publishTime * 1000);
  const normalizedStatus = payload.status?.toUpperCase();
  return {
    symbol,
    price,
    confidence,
    publishedAt,
    source: "PYTH",
    status:
      normalizedStatus === "TRADING"
        ? "TRADING"
        : normalizedStatus === "HALTED"
          ? "HALTED"
          : "UNKNOWN",
  };
}

export function isStale(
  tick: MarketTick,
  now: Date,
  staleAfterMs: number,
): boolean {
  assertInteger(staleAfterMs, "staleAfterMs");
  if (staleAfterMs < 0 || Number.isNaN(now.getTime()))
    throw new Error("invalid stale check input");
  return now.getTime() - tick.publishedAt.getTime() > staleAfterMs;
}

export function assertExecutableTick(
  tick: MarketTick,
  now: Date,
  staleAfterMs: number,
): void {
  if (tick.status !== "TRADING") throw new Error("Market is not trading.");
  if (isStale(tick, now, staleAfterMs))
    throw new Error("Market price is stale; new executions are disabled.");
}

export function aggregateTicks(
  ticks: readonly MarketTick[],
  intervalMs: number,
): Candle[] {
  assertInteger(intervalMs, "intervalMs");
  if (intervalMs <= 0) throw new Error("intervalMs must be positive");
  const unique = new Map<string, MarketTick>();
  for (const tick of ticks)
    unique.set(`${tick.publishedAt.getTime()}:${tick.price.toString()}`, tick);
  const ordered = [...unique.values()].sort(
    (a, b) => a.publishedAt.getTime() - b.publishedAt.getTime(),
  );
  const candles = new Map<number, Candle>();
  for (const tick of ordered) {
    const bucket =
      Math.floor(tick.publishedAt.getTime() / intervalMs) * intervalMs;
    const candle = candles.get(bucket);
    if (!candle) {
      candles.set(bucket, {
        time: new Date(bucket),
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
      });
    } else {
      candle.high = Decimal.max(candle.high, tick.price);
      candle.low = Decimal.min(candle.low, tick.price);
      candle.close = tick.price;
    }
  }
  return [...candles.values()];
}

export function reconnectDelayMs(
  attempt: number,
  baseMs = 500,
  maxMs = 30_000,
): number {
  assertInteger(attempt, "attempt");
  if (attempt < 0) throw new Error("attempt must be non-negative");
  return Math.min(maxMs, baseMs * 2 ** attempt);
}

export function demoTick(
  symbol: string,
  sequence: number,
  publishedAt: Date,
): MarketTick {
  assertInteger(sequence, "sequence");
  const base =
    symbol === "ETH/USD" ? new Decimal("3500") : new Decimal("67500");
  const increment =
    symbol === "ETH/USD" ? new Decimal("0.75") : new Decimal("12.5");
  const offset = new Decimal(String((sequence % 21) - 10));
  return {
    symbol,
    price: quantize(base.plus(increment.mul(offset)), SCALE.price),
    confidence: positive("0.5", "confidence"),
    publishedAt,
    source: "DEMO",
    status: "TRADING",
  };
}

export function serializeTick(tick: MarketTick, state: ConnectionState) {
  return {
    symbol: tick.symbol,
    price: tick.price.toFixed(SCALE.price),
    confidence: tick.confidence.toFixed(SCALE.price),
    publishedAt: tick.publishedAt.toISOString(),
    source: tick.source,
    status: tick.status,
    connection: state,
    volume: null,
    fundingRate: null,
    openInterest: null,
  };
}
