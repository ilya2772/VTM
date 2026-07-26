import { demoTick, serializeTick } from "@/server/market-data";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get("symbol") ?? "BTC/USD";
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
  const stream = new ReadableStream({
    start(controller) {
      const emit = () => {
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
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });
  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    },
  });
}
