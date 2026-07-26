// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AxiomChartProvider,
  mergeTickIntoBar,
} from "@/features/terminal/chart/chart-provider";

class MockEventSource {
  static instances: MockEventSource[] = [];
  onerror: (() => void) | null = null;
  readonly listeners = new Map<string, EventListener>();
  closed = false;

  constructor(readonly url: string) {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    this.listeners.set(type, listener);
  }

  emit(payload: unknown) {
    this.listeners.get("tick")?.(
      new MessageEvent("tick", { data: JSON.stringify(payload) }),
    );
  }

  close() {
    this.closed = true;
  }
}

describe("AxiomChartProvider", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal("EventSource", MockEventSource);
  });

  it("exposes all 12 resolutions and resolves only supported demo symbols", async () => {
    const provider = new AxiomChartProvider();
    const configuration = await new Promise<{
      supportedResolutions: readonly string[];
    }>((resolve) => provider.onReady(resolve));
    expect(configuration.supportedResolutions).toHaveLength(12);
    const result = await new Promise<string>((resolve, reject) =>
      provider.resolveSymbol(
        "BTC/USD",
        (symbol) => resolve(symbol.exchange),
        reject,
      ),
    );
    expect(result).toBe("AXIOM DEMO");
  });

  it("rebuilds candles, ignores duplicate events, and closes replaced subscriptions", () => {
    const provider = new AxiomChartProvider();
    const bars: unknown[] = [];
    const symbol = {
      name: "BTC/USD",
      ticker: "BTC/USD",
      description: "demo",
      type: "crypto" as const,
      session: "24x7" as const,
      timezone: "Etc/UTC" as const,
      exchange: "AXIOM DEMO" as const,
      minmov: 1 as const,
      pricescale: 100,
      hasIntraday: true as const,
      supportedResolutions: ["1m"] as const,
    };
    provider.subscribeBars(
      symbol,
      "1m",
      (bar) => bars.push(bar),
      "chart",
      vi.fn(),
    );
    const first = MockEventSource.instances[0];
    expect(first?.url).toContain("BTC%2FUSD");
    const tick = {
      symbol: "BTC/USD",
      price: "100",
      publishedAt: "2026-01-01T00:00:01.000Z",
    };
    first?.emit(tick);
    first?.emit(tick);
    first?.emit({
      ...tick,
      price: "105",
      publishedAt: "2026-01-01T00:00:20.000Z",
    });
    expect(bars).toEqual([
      { time: 1_767_225_600, open: 100, high: 100, low: 100, close: 100 },
      { time: 1_767_225_600, open: 100, high: 105, low: 100, close: 105 },
    ]);

    provider.subscribeBars(symbol, "5m", vi.fn(), "chart", vi.fn());
    expect(first?.closed).toBe(true);
    provider.unsubscribeBars("chart");
    expect(MockEventSource.instances[1]?.closed).toBe(true);
  });

  it("starts a new bucket without carrying the previous OHLC", () => {
    const first = mergeTickIntoBar(null, 100, 120, "1m");
    expect(mergeTickIntoBar(first, 90, 180, "1m")).toEqual({
      time: 180,
      open: 90,
      high: 90,
      low: 90,
      close: 90,
    });
  });
});
