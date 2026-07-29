import "server-only";

import {
  PythLazerClient,
  type Channel,
  type JsonOrBinaryResponse,
  type LazerClientConfig,
  type Request as PythRequest,
} from "@pythnetwork/pyth-lazer-sdk";
import { z } from "zod";

import { decimal, quantize, SCALE } from "@/server/execution";

import type { Candle, ConnectionState, MarketTick } from "./core";

const METADATA_URL = "https://pyth-lazer.dourolabs.app/v1/symbols";
const HISTORY_URL = "https://pyth.dourolabs.app/v1";
const LATEST_PRICE_URL = "https://pyth-lazer.dourolabs.app/v1/latest_price";

export const PYTH_STREAM_URLS = [
  "wss://pyth-lazer-0.dourolabs.app/v1/stream",
  "wss://pyth-lazer-1.dourolabs.app/v1/stream",
  "wss://pyth-lazer-2.dourolabs.app/v1/stream",
] as const;

const numeric = z.union([z.string(), z.number()]);
const metadataSchema = z.array(
  z.object({
    pyth_lazer_id: z.number().int().nonnegative(),
    name: z.string().min(1),
    symbol: z.string().min(1),
    description: z.string(),
    asset_type: z.string(),
    exponent: z.number().int(),
    min_channel: z.string(),
    state: z.string(),
  }),
);
const historySchema = z.discriminatedUnion("s", [
  z.object({
    s: z.literal("ok"),
    t: z.array(z.number().int()),
    o: z.array(numeric),
    h: z.array(numeric),
    l: z.array(numeric),
    c: z.array(numeric),
  }),
  z.object({ s: z.literal("no_data") }),
]);
const latestSchema = z.object({
  parsed: z
    .object({
      timestampUs: numeric,
      priceFeeds: z.array(
        z.object({
          priceFeedId: z.number().int().nonnegative(),
          price: numeric.optional(),
          exponent: z.number().int().optional(),
          confidence: numeric.optional(),
          marketSession: z.string().optional(),
          feedUpdateTimestamp: numeric.optional(),
        }),
      ),
    })
    .optional(),
});

export interface PythInstrumentMetadata {
  feedId: number;
  pythSymbol: string;
  symbol: string;
  displayName: string;
  assetType: string;
  exponent: number;
  minChannel: string;
  status: string;
}

export interface PythSubscription {
  close(): void;
}

export interface PythStreamHandlers {
  onTick(tick: MarketTick): void;
  onState(state: ConnectionState): void;
  onError(error: Error): void;
}

export interface PythRealtimeClient {
  addMessageListener(handler: (event: JsonOrBinaryResponse) => void): void;
  addAllConnectionsDownListener(handler: () => void): void;
  addConnectionRestoredListener(handler: () => void): void;
  subscribe(request: PythRequest): void;
  unsubscribe(subscriptionId: number): void;
  shutdown(): void;
}

export type PythClientFactory = (
  config: LazerClientConfig,
) => Promise<PythRealtimeClient>;

export interface PythAdapterOptions {
  apiKey: string;
  channel: Channel;
  fetcher?: typeof fetch;
  clientFactory?: PythClientFactory;
}

function unixMicrosecondsToDate(value: string | number): Date {
  const microseconds = BigInt(String(value));
  const milliseconds = microseconds / BigInt(1_000);
  if (
    milliseconds > BigInt(Number.MAX_SAFE_INTEGER) ||
    milliseconds < BigInt(0)
  )
    throw new Error("Pyth timestamp is outside the supported range");
  const date = new Date(Number(milliseconds));
  if (Number.isNaN(date.getTime())) throw new Error("Invalid Pyth timestamp");
  return date;
}

function statusFromMarketSession(
  marketSession: string | undefined,
): MarketTick["status"] {
  if (!marketSession) return "UNKNOWN";
  return marketSession.toLowerCase() === "closed" ? "HALTED" : "TRADING";
}

function normalizedStreamTick(
  symbol: string,
  feed: {
    price?: string | number;
    exponent?: number;
    confidence?: string | number;
    marketSession?: string;
    feedUpdateTimestamp?: string | number;
  },
): MarketTick | null {
  if (
    feed.price === undefined ||
    feed.exponent === undefined ||
    feed.confidence === undefined ||
    feed.feedUpdateTimestamp === undefined
  )
    return null;
  const factor = decimal("10").pow(feed.exponent);
  const price = quantize(
    decimal(String(feed.price), "price").mul(factor),
    SCALE.price,
  );
  const confidence = quantize(
    decimal(String(feed.confidence), "confidence").mul(factor),
    SCALE.price,
  );
  if (!price.isPositive() || confidence.isNegative())
    throw new Error("Normalized Pyth stream values are invalid");
  return {
    symbol,
    price,
    confidence,
    publishedAt: unixMicrosecondsToDate(feed.feedUpdateTimestamp),
    source: "PYTH",
    status: statusFromMarketSession(feed.marketSession),
  };
}

export function qualifyPythSymbol(symbol: string): string {
  return symbol.includes(".") ? symbol : `Crypto.${symbol}`;
}

export class PythAdapter {
  private readonly fetcher: typeof fetch;
  private readonly clientFactory: PythClientFactory;

  constructor(private readonly options: PythAdapterOptions) {
    if (!options.apiKey.trim())
      throw new Error("PYTH_PRO_API_KEY is required in pyth mode");
    this.fetcher = options.fetcher ?? fetch;
    this.clientFactory =
      options.clientFactory ??
      (async (config) => PythLazerClient.create(config));
  }

  async getInstruments(query?: string): Promise<PythInstrumentMetadata[]> {
    const url = new URL(METADATA_URL);
    if (query) url.searchParams.set("query", query);
    const response = await this.fetcher(url, {
      headers: { Authorization: `Bearer ${this.options.apiKey}` },
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(`Pyth metadata request failed with ${response.status}`);
    const parsed = metadataSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error("Invalid Pyth metadata response");
    return parsed.data.map((item) => ({
      feedId: item.pyth_lazer_id,
      pythSymbol: item.name,
      symbol: item.symbol,
      displayName: item.description,
      assetType: item.asset_type,
      exponent: item.exponent,
      minChannel: item.min_channel,
      status: item.state,
    }));
  }

  async getHistory(
    symbol: string,
    from: Date,
    to: Date,
    resolution: string,
  ): Promise<Candle[]> {
    const url = new URL(
      `${HISTORY_URL}/${encodeURIComponent(this.options.channel)}/history`,
    );
    url.searchParams.set("symbol", qualifyPythSymbol(symbol));
    url.searchParams.set("from", String(Math.floor(from.getTime() / 1_000)));
    url.searchParams.set("to", String(Math.floor(to.getTime() / 1_000)));
    url.searchParams.set("resolution", resolution);
    const response = await this.fetcher(url, {
      headers: { Authorization: `Bearer ${this.options.apiKey}` },
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(`Pyth history request failed with ${response.status}`);
    const parsed = historySchema.safeParse(await response.json());
    if (!parsed.success) throw new Error("Invalid Pyth history response");
    if (parsed.data.s === "no_data") return [];
    const { t, o, h, l, c } = parsed.data;
    if (![o.length, h.length, l.length, c.length].every((n) => n === t.length))
      throw new Error("Pyth history arrays are not aligned");
    return t.map((timestamp, index) => {
      const open = o[index];
      const high = h[index];
      const low = l[index];
      const close = c[index];
      if (
        open === undefined ||
        high === undefined ||
        low === undefined ||
        close === undefined
      )
        throw new Error("Pyth history candle is incomplete");
      return {
        time: new Date(timestamp * 1_000),
        open: quantize(decimal(String(open), "open"), SCALE.price),
        high: quantize(decimal(String(high), "high"), SCALE.price),
        low: quantize(decimal(String(low), "low"), SCALE.price),
        close: quantize(decimal(String(close), "close"), SCALE.price),
      };
    });
  }

  async getLatestTick(symbol: string): Promise<MarketTick> {
    const response = await this.fetcher(LATEST_PRICE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        symbols: [qualifyPythSymbol(symbol)],
        properties: [
          "price",
          "exponent",
          "confidence",
          "marketSession",
          "feedUpdateTimestamp",
        ],
        formats: [],
        parsed: true,
        channel: this.options.channel,
      }),
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(`Pyth latest price failed with ${response.status}`);
    const parsed = latestSchema.safeParse(await response.json());
    const feed = parsed.success ? parsed.data.parsed?.priceFeeds[0] : undefined;
    const tick = feed ? normalizedStreamTick(symbol, feed) : null;
    if (!tick) throw new Error("Pyth latest price is unavailable");
    return tick;
  }

  async subscribe(
    symbol: string,
    handlers: PythStreamHandlers,
  ): Promise<PythSubscription> {
    const subscriptionId = 1;
    const client = await this.clientFactory({
      token: this.options.apiKey,
      webSocketPoolConfig: {
        urls: [...PYTH_STREAM_URLS],
        numConnections: PYTH_STREAM_URLS.length,
        onWebSocketPoolError: (error) => handlers.onError(error),
        rwsConfig: {
          heartbeatTimeoutDurationMs: 5_000,
          maxRetryDelayMs: 30_000,
        },
      },
    });
    client.addAllConnectionsDownListener(() =>
      handlers.onState("RECONNECTING"),
    );
    client.addConnectionRestoredListener(() =>
      handlers.onState("RECONNECTING"),
    );
    client.addMessageListener((event) => {
      if (event.type !== "json") return;
      const message = event.value;
      if (message.type === "error" || message.type === "subscriptionError") {
        handlers.onError(new Error("Pyth subscription failed"));
        return;
      }
      if (message.type !== "streamUpdated" || !message.parsed) return;
      const feed = message.parsed.priceFeeds[0];
      const tick = feed ? normalizedStreamTick(symbol, feed) : null;
      if (tick) handlers.onTick(tick);
    });
    client.subscribe({
      type: "subscribe",
      subscriptionId,
      symbols: [qualifyPythSymbol(symbol)],
      properties: [
        "price",
        "exponent",
        "confidence",
        "marketSession",
        "feedUpdateTimestamp",
      ],
      formats: [],
      deliveryFormat: "json",
      parsed: true,
      ignoreInvalidFeedIds: true,
      channel: this.options.channel,
    });
    let closed = false;
    return {
      close() {
        if (closed) return;
        closed = true;
        client.unsubscribe(subscriptionId);
        client.shutdown();
      },
    };
  }
}
