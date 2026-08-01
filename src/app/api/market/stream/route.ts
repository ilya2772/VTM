import { z } from "zod";

import {
  connectionForTick,
  getConfiguredMarketTick,
  serializeTick,
  type MarketTick,
} from "@/server/market-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  symbol: z
    .enum(["BTC/USD", "ETH/USD", "SOL/USD", "XRP/USD"])
    .default("BTC/USD"),
});

function unavailableTick(symbol: string, hasPreviousTick: boolean) {
  return {
    symbol,
    price: "0",
    confidence: "0",
    publishedAt: new Date(0).toISOString(),
    source: "PYTH" as const,
    status: "UNKNOWN",
    connection: hasPreviousTick ? ("STALE" as const) : ("ERROR" as const),
    volume: null,
    fundingRate: null,
    openInterest: null,
  };
}

export function GET(request: Request) {
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return Response.json(
      {
        code: "INVALID_STREAM_QUERY",
        message: "Unsupported market-data stream query.",
      },
      { status: 400 },
    );
  }

  const { symbol } = parsed.data;
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  let inFlight = false;
  let lastTick: MarketTick | null = null;

  const stop = () => {
    closed = true;
    if (timer) clearInterval(timer);
  };

  const stream = new ReadableStream({
    start(controller) {
      const emit = async () => {
        if (closed || inFlight) return;
        inFlight = true;
        let payload;
        try {
          const now = new Date();
          const tick = await getConfiguredMarketTick(symbol, now);
          lastTick = tick;
          payload = serializeTick(tick, connectionForTick(tick, now));
        } catch {
          payload = unavailableTick(symbol, lastTick !== null);
        } finally {
          inFlight = false;
        }
        if (!closed)
          controller.enqueue(
            encoder.encode(`event: tick\ndata: ${JSON.stringify(payload)}\n\n`),
          );
      };

      void emit();
      timer = setInterval(() => void emit(), 1_000);
      request.signal.addEventListener(
        "abort",
        () => {
          stop();
          controller.close();
        },
        { once: true },
      );
    },
    cancel() {
      stop();
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
