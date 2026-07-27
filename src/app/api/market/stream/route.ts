import { z } from "zod";

import { demoTick, serializeTick } from "@/server/market-data";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  symbol: z.enum(["BTC/USD", "ETH/USD"]).default("BTC/USD"),
});

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
  if (process.env.MARKET_DATA_MODE !== "demo") {
    return Response.json(
      {
        code: "STREAM_UNAVAILABLE",
        message: "Pyth streaming requires configured server credentials.",
      },
      { status: 503 },
    );
  }
  const encoder = new TextEncoder();
  let sequence = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const stop = () => {
    closed = true;
    if (timer) clearInterval(timer);
  };
  const stream = new ReadableStream({
    start(controller) {
      const emit = () => {
        if (closed) return;
        const payload = serializeTick(
          demoTick(symbol, sequence++, new Date()),
          "DEMO",
        );
        controller.enqueue(
          encoder.encode(`event: tick\ndata: ${JSON.stringify(payload)}\n\n`),
        );
      };
      emit();
      timer = setInterval(emit, 1000);
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
