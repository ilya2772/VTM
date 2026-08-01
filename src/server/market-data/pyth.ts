import "server-only";

import {
  normalizePythPrice,
  type MarketTick,
  type PythPricePayload,
} from "./core";

const feedIds: Readonly<Record<string, number>> = {
  "BTC/USD": 1,
  "ETH/USD": 2,
  "SOL/USD": 6,
  "XRP/USD": 14,
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function numericString(value: unknown, label: string): string {
  if (typeof value === "string" && /^-?\d+$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value))
    return String(value);
  throw new Error(`Invalid Pyth ${label}`);
}

function microsecondsToSeconds(value: unknown): number {
  const microseconds = BigInt(numericString(value, "feed timestamp"));
  const seconds = Number(microseconds / BigInt(1_000_000));
  if (!Number.isSafeInteger(seconds))
    throw new Error("Invalid Pyth feed timestamp");
  return seconds;
}

export function parseLatestPrice(
  symbol: string,
  expectedFeedId: number,
  body: unknown,
): MarketTick {
  const envelope = Array.isArray(body)
    ? objectValue(body[0])
    : objectValue(body);
  const parsed = objectValue(envelope?.parsed ?? envelope);
  const priceFeeds = parsed?.priceFeeds;
  if (!Array.isArray(priceFeeds))
    throw new Error("Invalid Pyth latest response");
  const feed = priceFeeds
    .map(objectValue)
    .find((item) => item?.priceFeedId === expectedFeedId);
  if (!feed) throw new Error("Requested Pyth feed is unavailable");
  if (!Number.isSafeInteger(feed.exponent))
    throw new Error("Invalid Pyth exponent");
  return normalizePythPrice(symbol, {
    price: numericString(feed.price, "price"),
    exponent: feed.exponent as number,
    confidence: numericString(feed.confidence, "confidence"),
    publishTime: microsecondsToSeconds(feed.feedUpdateTimestamp),
    status: "trading",
  });
}

export class PythAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly channel: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!apiKey) throw new Error("PYTH_PRO_API_KEY is required in pyth mode");
  }

  async getHistory(
    symbol: string,
    from: Date,
    to: Date,
  ): Promise<MarketTick[]> {
    const url = new URL(
      `https://pyth.dourolabs.app/v1/${encodeURIComponent(this.channel)}/history`,
    );
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("from", from.toISOString());
    url.searchParams.set("to", to.toISOString());
    const response = await this.fetcher(url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(`Pyth history request failed with ${response.status}`);
    const body: unknown = await response.json();
    if (!Array.isArray(body)) throw new Error("Invalid Pyth history response");
    return body.map((item) =>
      normalizePythPrice(symbol, item as PythPricePayload),
    );
  }

  async getLatest(symbol: string): Promise<MarketTick> {
    const feedId = feedIds[symbol];
    if (!feedId) throw new Error("Unsupported Pyth symbol");
    const response = await this.fetcher(
      "https://pyth-lazer.dourolabs.app/v1/latest_price",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "subscribe",
          subscriptionId: 1,
          priceFeedIds: [feedId],
          properties: [
            "price",
            "confidence",
            "exponent",
            "feedUpdateTimestamp",
          ],
          formats: [],
          channel: this.channel,
          ignoreInvalidFeeds: true,
        }),
        cache: "no-store",
      },
    );
    if (!response.ok)
      throw new Error(`Pyth latest request failed with ${response.status}`);
    return parseLatestPrice(symbol, feedId, await response.json());
  }

  normalizeStreamMessage(
    symbol: string,
    payload: PythPricePayload,
  ): MarketTick {
    return normalizePythPrice(symbol, payload);
  }
}
