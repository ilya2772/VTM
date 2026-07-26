import "server-only";

import {
  normalizePythPrice,
  type MarketTick,
  type PythPricePayload,
} from "./core";

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

  normalizeStreamMessage(
    symbol: string,
    payload: PythPricePayload,
  ): MarketTick {
    return normalizePythPrice(symbol, payload);
  }
}
