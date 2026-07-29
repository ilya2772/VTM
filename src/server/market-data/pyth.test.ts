// @vitest-environment node

import type {
  JsonOrBinaryResponse,
  LazerClientConfig,
  Request as PythRequest,
} from "@pythnetwork/pyth-lazer-sdk";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PYTH_STREAM_URLS, PythAdapter, type PythRealtimeClient } from "./pyth";

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("PythAdapter", () => {
  it("loads validated instrument metadata without placing the key in the URL", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      response([
        {
          pyth_lazer_id: 1,
          name: "Crypto.BTC/USD",
          symbol: "BTC/USD",
          description: "Bitcoin / US Dollar",
          asset_type: "crypto",
          exponent: -8,
          min_channel: "fixed_rate@200ms",
          state: "active",
        },
      ]),
    );
    const adapter = new PythAdapter({
      apiKey: "server-secret",
      channel: "fixed_rate@200ms",
      fetcher,
    });

    await expect(adapter.getInstruments("BTC")).resolves.toEqual([
      {
        feedId: 1,
        pythSymbol: "Crypto.BTC/USD",
        symbol: "BTC/USD",
        displayName: "Bitcoin / US Dollar",
        assetType: "crypto",
        exponent: -8,
        minChannel: "fixed_rate@200ms",
        status: "active",
      },
    ]);
    const [input, init] = fetcher.mock.calls[0] ?? [];
    expect(String(input)).toContain("query=BTC");
    expect(String(input)).not.toContain("server-secret");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer server-secret",
    );
  });

  it("loads aligned OHLC history with seconds and an explicit resolution", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      response({
        s: "ok",
        t: [1_700_000_000, 1_700_000_060],
        o: ["67500", "67510"],
        h: ["67520", "67530"],
        l: ["67490", "67500"],
        c: ["67510", "67525"],
      }),
    );
    const adapter = new PythAdapter({
      apiKey: "secret",
      channel: "fixed_rate@200ms",
      fetcher,
    });
    const candles = await adapter.getHistory(
      "BTC/USD",
      new Date("2023-11-14T22:13:20Z"),
      new Date("2023-11-14T22:15:20Z"),
      "1",
    );

    expect(candles).toHaveLength(2);
    expect(candles[1]?.close.toFixed(8)).toBe("67525.00000000");
    const [input] = fetcher.mock.calls[0] ?? [];
    const url = new URL(String(input));
    expect(url.searchParams.get("symbol")).toBe("Crypto.BTC/USD");
    expect(url.searchParams.get("from")).toBe("1700000000");
    expect(url.searchParams.get("resolution")).toBe("1");
  });

  it("returns an empty series for a valid no-data history response", async () => {
    const adapter = new PythAdapter({
      apiKey: "secret",
      channel: "fixed_rate@200ms",
      fetcher: vi.fn<typeof fetch>(async () => response({ s: "no_data" })),
    });

    await expect(
      adapter.getHistory(
        "BTC/USD",
        new Date("2023-11-14T22:13:20Z"),
        new Date("2023-11-14T22:15:20Z"),
        "1",
      ),
    ).resolves.toEqual([]);
  });

  it("uses feedUpdateTimestamp for the authoritative latest price", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      response({
        parsed: {
          timestampUs: "1700000001000000",
          priceFeeds: [
            {
              priceFeedId: 1,
              price: "6750012",
              exponent: -2,
              confidence: 25,
              marketSession: "regular",
              feedUpdateTimestamp: 1_700_000_000_000_000,
            },
          ],
        },
      }),
    );
    const adapter = new PythAdapter({
      apiKey: "secret",
      channel: "fixed_rate@200ms",
      fetcher,
    });
    const tick = await adapter.getLatestTick("BTC/USD");
    expect(tick.price.toFixed(8)).toBe("67500.12000000");
    expect(tick.confidence.toFixed(8)).toBe("0.25000000");
    expect(tick.publishedAt.toISOString()).toBe("2023-11-14T22:13:20.000Z");
  });

  it("subscribes through three redundant sockets and forwards lifecycle state", async () => {
    let messageListener: (event: JsonOrBinaryResponse) => void = () => {};
    let downListener = () => {};
    let restoredListener = () => {};
    let subscriptionRequest: PythRequest | null = null;
    const unsubscribe = vi.fn();
    const shutdown = vi.fn();
    const client: PythRealtimeClient = {
      addMessageListener(handler) {
        messageListener = handler;
      },
      addAllConnectionsDownListener(handler) {
        downListener = handler;
      },
      addConnectionRestoredListener(handler) {
        restoredListener = handler;
      },
      subscribe(request) {
        subscriptionRequest = request;
      },
      unsubscribe,
      shutdown,
    };
    const receivedConfigs: LazerClientConfig[] = [];
    const adapter = new PythAdapter({
      apiKey: "secret",
      channel: "fixed_rate@200ms",
      clientFactory: async (config) => {
        receivedConfigs.push(config);
        return client;
      },
    });
    const onTick = vi.fn();
    const onState = vi.fn();
    const onError = vi.fn();
    const active = await adapter.subscribe("BTC/USD", {
      onTick,
      onState,
      onError,
    });

    expect(receivedConfigs[0]?.webSocketPoolConfig.urls).toEqual([
      ...PYTH_STREAM_URLS,
    ]);
    expect(receivedConfigs[0]?.webSocketPoolConfig.numConnections).toBe(3);
    expect(subscriptionRequest).toMatchObject({
      type: "subscribe",
      symbols: ["Crypto.BTC/USD"],
      channel: "fixed_rate@200ms",
      parsed: true,
    });
    messageListener({
      type: "json",
      value: {
        type: "streamUpdated",
        subscriptionId: 1,
        parsed: {
          timestampUs: "1700000001000000",
          priceFeeds: [
            {
              priceFeedId: 1,
              price: "6750012",
              exponent: -2,
              confidence: 25,
              marketSession: "regular",
              feedUpdateTimestamp: 1_700_000_000_000_000,
            },
          ],
        },
      },
    });
    downListener();
    restoredListener();
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenNthCalledWith(1, "RECONNECTING");
    expect(onState).toHaveBeenNthCalledWith(2, "RECONNECTING");
    expect(onError).not.toHaveBeenCalled();
    active.close();
    active.close();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(shutdown).toHaveBeenCalledOnce();
  });
});
