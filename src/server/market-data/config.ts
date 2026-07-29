import "server-only";

import type { Channel } from "@pythnetwork/pyth-lazer-sdk";

export interface MarketDataConfig {
  mode: "demo" | "pyth";
  channel: Channel;
  apiKey: string | null;
  staleAfterMs: number;
  heartbeatMs: number;
  demoIntervalMs: number;
}

function parseChannel(value: string): Channel {
  switch (value) {
    case "real_time":
    case "fixed_rate@50ms":
    case "fixed_rate@200ms":
    case "fixed_rate@1000ms":
      return value;
    default:
      throw new Error("PYTH_CHANNEL is unsupported by the installed Pyth SDK");
  }
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  label: string,
): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`${label} must be a positive integer`);
  return parsed;
}

export function getMarketDataConfig(
  environment: NodeJS.ProcessEnv = process.env,
): MarketDataConfig {
  const mode = environment.MARKET_DATA_MODE ?? "demo";
  if (mode !== "demo" && mode !== "pyth")
    throw new Error("MARKET_DATA_MODE must be demo or pyth");
  const rawChannel = environment.PYTH_CHANNEL ?? "fixed_rate@200ms";
  const apiKey = environment.PYTH_PRO_API_KEY?.trim() || null;
  return {
    mode,
    channel: parseChannel(rawChannel),
    apiKey,
    staleAfterMs: positiveInteger(
      environment.MARKET_STALE_AFTER_MS,
      5_000,
      "MARKET_STALE_AFTER_MS",
    ),
    heartbeatMs: positiveInteger(
      environment.MARKET_HEARTBEAT_MS,
      10_000,
      "MARKET_HEARTBEAT_MS",
    ),
    demoIntervalMs: positiveInteger(
      environment.MARKET_DEMO_INTERVAL_MS,
      1_000,
      "MARKET_DEMO_INTERVAL_MS",
    ),
  };
}

export function requirePythApiKey(config: MarketDataConfig): string {
  if (!config.apiKey)
    throw new Error("PYTH_PRO_API_KEY is required in pyth mode");
  return config.apiKey;
}
