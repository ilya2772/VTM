// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { MarketConnectionMonitor } from "./monitor";

describe("MarketConnectionMonitor", () => {
  it("reports live, stale, reconnect and error states without duplicates", () => {
    const states: string[] = [];
    const monitor = new MarketConnectionMonitor("PYTH", 5_000, (state) =>
      states.push(state),
    );

    expect(monitor.start()).toBe("RECONNECTING");
    expect(monitor.acceptTick(new Date("2026-01-01T00:00:00.000Z"))).toBe(
      "LIVE",
    );
    expect(monitor.checkStale(new Date("2026-01-01T00:00:05.000Z"))).toBe(
      "LIVE",
    );
    expect(monitor.checkStale(new Date("2026-01-01T00:00:05.001Z"))).toBe(
      "STALE",
    );
    monitor.checkStale(new Date("2026-01-01T00:00:06.000Z"));
    monitor.acceptTick(new Date("2026-01-01T00:00:06.000Z"));
    monitor.connectionsDown();
    monitor.connectionsDown();
    monitor.connectionRestored();
    monitor.fail();

    expect(states).toEqual([
      "RECONNECTING",
      "LIVE",
      "STALE",
      "LIVE",
      "RECONNECTING",
      "ERROR",
    ]);
  });

  it("keeps the demo source explicitly in DEMO state", () => {
    const listener = vi.fn();
    const monitor = new MarketConnectionMonitor("DEMO", 5_000, listener);
    monitor.start();
    monitor.acceptTick(new Date("2026-01-01T00:00:00Z"));
    monitor.connectionsDown();
    expect(monitor.current()).toBe("DEMO");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
