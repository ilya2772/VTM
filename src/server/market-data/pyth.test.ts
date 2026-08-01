// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PythAdapter, parseLatestPrice } from "./pyth";

const latestPayload = {
  type: "streamUpdated",
  subscriptionId: 1,
  parsed: {
    timestampUs: "1758690761750000",
    priceFeeds: [
      {
        priceFeedId: 6,
        price: "17525000000",
        exponent: -8,
        confidence: "1200000",
        feedUpdateTimestamp: "1758690761750000",
      },
    ],
  },
};

describe("Pyth Pro latest-price adapter", () => {
  it("normalizes the selected feed and uses its feed timestamp", () => {
    const tick = parseLatestPrice("SOL/USD", 6, latestPayload);
    expect(tick.symbol).toBe("SOL/USD");
    expect(tick.price.toString()).toBe("175.25");
    expect(tick.confidence.toString()).toBe("0.012");
    expect(tick.publishedAt.toISOString()).toBe("2025-09-24T05:12:41.000Z");
  });

  it("keeps the API key server-side and requests the matching XRP feed", async () => {
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return Response.json({
          ...latestPayload,
          parsed: {
            ...latestPayload.parsed,
            priceFeeds: [
              {
                ...latestPayload.parsed.priceFeeds[0],
                priceFeedId: 14,
                price: "62000000",
              },
            ],
          },
        });
      },
    );
    const adapter = new PythAdapter(
      "server-secret",
      "fixed_rate@200ms",
      fetcher,
    );
    const tick = await adapter.getLatest("XRP/USD");
    expect(tick.price.toString()).toBe("0.62");
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, request] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("https://pyth-lazer.dourolabs.app/v1/latest_price");
    expect(request?.headers).toMatchObject({
      Authorization: "Bearer server-secret",
    });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      type: "subscribe",
      priceFeedIds: [14],
      properties: expect.arrayContaining([
        "price",
        "exponent",
        "feedUpdateTimestamp",
      ]),
      formats: [],
      channel: "fixed_rate@200ms",
    });
  });

  it("rejects a response that does not contain the selected feed", () => {
    expect(() => parseLatestPrice("BTC/USD", 1, latestPayload)).toThrow(
      "Requested Pyth feed is unavailable",
    );
  });
});
