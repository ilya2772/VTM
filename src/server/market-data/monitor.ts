import "server-only";

import type { ConnectionState, MarketMode } from "./core";

export class MarketConnectionMonitor {
  private state: ConnectionState;
  private lastTickAt: Date | null = null;

  constructor(
    private readonly source: MarketMode,
    private readonly staleAfterMs: number,
    private readonly onState: (state: ConnectionState) => void,
  ) {
    this.state = source === "DEMO" ? "DEMO" : "RECONNECTING";
  }

  start(): ConnectionState {
    this.onState(this.state);
    return this.state;
  }

  acceptTick(publishedAt: Date): ConnectionState {
    this.lastTickAt = publishedAt;
    return this.transition(this.source === "DEMO" ? "DEMO" : "LIVE");
  }

  connectionsDown(): ConnectionState {
    if (this.source === "DEMO") return this.state;
    return this.transition("RECONNECTING");
  }

  connectionRestored(): ConnectionState {
    if (this.source === "DEMO") return this.state;
    return this.transition("RECONNECTING");
  }

  fail(): ConnectionState {
    return this.transition("ERROR");
  }

  checkStale(now: Date): ConnectionState {
    if (
      this.source === "PYTH" &&
      this.lastTickAt &&
      now.getTime() - this.lastTickAt.getTime() > this.staleAfterMs
    )
      return this.transition("STALE");
    return this.state;
  }

  current(): ConnectionState {
    return this.state;
  }

  private transition(next: ConnectionState): ConnectionState {
    if (this.state !== next) {
      this.state = next;
      this.onState(next);
    }
    return this.state;
  }
}
