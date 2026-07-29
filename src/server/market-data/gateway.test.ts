// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createMarketStreamResponse } from "./gateway";

describe("market SSE gateway", () => {
  it("streams deterministic DEMO state and tick without unsupported fields", async () => {
    const abort = new AbortController();
    const request = new Request("http://localhost/api/market/stream", {
      signal: abort.signal,
    });
    const response = createMarketStreamResponse(
      request,
      "BTC/USD",
      {
        mode: "demo",
        channel: "fixed_rate@200ms",
        apiKey: null,
        staleAfterMs: 5_000,
        heartbeatMs: 60_000,
        demoIntervalMs: 60_000,
      },
      { now: () => new Date("2026-01-01T00:00:00Z") },
    );
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    const decoder = new TextDecoder();
    const first = await reader?.read();
    const second = await reader?.read();
    abort.abort();
    await reader?.cancel();
    const output = `${decoder.decode(first?.value)}${decoder.decode(second?.value)}`;
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(output).toContain("event: state");
    expect(output).toContain('"connection":"DEMO"');
    expect(output).toContain('"source":"DEMO"');
    expect(output).toContain('"volume":null');
    expect(output).not.toContain("apiKey");
  });
});
