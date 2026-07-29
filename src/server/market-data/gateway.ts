import "server-only";

import {
  demoTick,
  serializeTick,
  type ConnectionState,
  type MarketTick,
} from "./core";
import type { MarketDataConfig } from "./config";
import { MarketConnectionMonitor } from "./monitor";
import { PythAdapter, type PythSubscription } from "./pyth";

export interface MarketStreamDependencies {
  now?: () => Date;
  createPythAdapter?: () => Pick<PythAdapter, "subscribe">;
}

function statePayload(
  symbol: string,
  connection: ConnectionState,
  source: "DEMO" | "PYTH",
) {
  return {
    symbol,
    connection,
    source,
    price: null,
    confidence: null,
    publishedAt: null,
    status: connection === "ERROR" ? "UNKNOWN" : null,
    volume: null,
    fundingRate: null,
    openInterest: null,
  };
}

export function createMarketStreamResponse(
  request: Request,
  symbol: string,
  config: MarketDataConfig,
  dependencies: MarketStreamDependencies = {},
): Response {
  const encoder = new TextEncoder();
  const now = dependencies.now ?? (() => new Date());
  const source = config.mode === "demo" ? "DEMO" : "PYTH";
  let closed = false;
  let demoTimer: ReturnType<typeof setInterval> | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let staleTimer: ReturnType<typeof setInterval> | undefined;
  let subscription: PythSubscription | undefined;
  let sequence = 0;
  let lastTick: MarketTick | null = null;
  let lastTickKey = "";
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };
      const monitor = new MarketConnectionMonitor(
        source,
        config.staleAfterMs,
        (connection) => {
          send("state", statePayload(symbol, connection, source));
          if (connection === "STALE" && lastTick)
            send("tick", serializeTick(lastTick, "STALE"));
        },
      );
      const emitTick = (tick: MarketTick) => {
        const key = `${tick.publishedAt.getTime()}:${tick.price.toString()}`;
        if (key === lastTickKey) return;
        lastTickKey = key;
        lastTick = tick;
        monitor.acceptTick(tick.publishedAt);
        const state = monitor.checkStale(now());
        send("tick", serializeTick(tick, state));
      };
      cleanup = () => {
        if (closed) return;
        closed = true;
        if (demoTimer) clearInterval(demoTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (staleTimer) clearInterval(staleTimer);
        subscription?.close();
        request.signal.removeEventListener("abort", cleanup);
      };
      request.signal.addEventListener("abort", cleanup, { once: true });
      monitor.start();
      heartbeatTimer = setInterval(() => {
        send("heartbeat", {
          symbol,
          connection: monitor.current(),
          serverTime: now().toISOString(),
        });
      }, config.heartbeatMs);

      if (config.mode === "demo") {
        const emitDemo = () => emitTick(demoTick(symbol, sequence++, now()));
        emitDemo();
        demoTimer = setInterval(emitDemo, config.demoIntervalMs);
        return;
      }

      staleTimer = setInterval(
        () => monitor.checkStale(now()),
        Math.min(1_000, config.staleAfterMs),
      );
      const adapter = dependencies.createPythAdapter?.();
      if (!adapter) {
        monitor.fail();
        send("error", { code: "PYTH_ADAPTER_UNAVAILABLE" });
        return;
      }
      void adapter
        .subscribe(symbol, {
          onTick: emitTick,
          onState: (state) => {
            if (state === "RECONNECTING") monitor.connectionsDown();
          },
          onError: () => {
            monitor.fail();
            send("error", { code: "PYTH_STREAM_ERROR" });
          },
        })
        .then((activeSubscription) => {
          if (closed) activeSubscription.close();
          else subscription = activeSubscription;
        })
        .catch(() => {
          monitor.fail();
          send("error", { code: "PYTH_CONNECTION_ERROR" });
        });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    },
  });
}
