import "server-only";

import {
  assertExecutableTick,
  demoTick,
  isStale,
  type ConnectionState,
  type MarketTick,
} from "./core";
import { PythAdapter } from "./pyth";

export const supportedMarketSymbols = [
  "BTC/USD",
  "ETH/USD",
  "SOL/USD",
  "XRP/USD",
] as const;

export type SupportedMarketSymbol = (typeof supportedMarketSymbols)[number];

export function isSupportedMarketSymbol(
  value: string,
): value is SupportedMarketSymbol {
  return supportedMarketSymbols.some((symbol) => symbol === value);
}

export function marketStaleAfterMs(): number {
  const configured = process.env.PYTH_STALE_AFTER_MS;
  if (!configured) return 5_000;
  const parsed = Number(configured);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 5_000;
}

export async function getConfiguredMarketTick(
  symbol: string,
  now = new Date(),
  fetcher: typeof fetch = fetch,
): Promise<MarketTick> {
  if (!isSupportedMarketSymbol(symbol))
    throw new Error("Unsupported market symbol");
  const mode = process.env.MARKET_DATA_MODE?.toLowerCase();
  if (mode === "demo")
    return demoTick(symbol, Math.floor(now.getTime() / 1000), now);
  if (mode !== "pyth") throw new Error("Market data mode is unavailable");
  const adapter = new PythAdapter(
    process.env.PYTH_PRO_API_KEY ?? "",
    process.env.PYTH_CHANNEL ?? "fixed_rate@200ms",
    fetcher,
  );
  return adapter.getLatest(symbol);
}

export function connectionForTick(
  tick: MarketTick,
  now = new Date(),
): ConnectionState {
  if (tick.source === "DEMO") return "DEMO";
  return isStale(tick, now, marketStaleAfterMs()) ? "STALE" : "LIVE";
}

export function assertConfiguredTickExecutable(
  tick: MarketTick,
  now = new Date(),
): void {
  assertExecutableTick(tick, now, marketStaleAfterMs());
}
