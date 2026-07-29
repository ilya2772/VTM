import {
  createMarketStreamResponse,
  getMarketDataConfig,
  PythAdapter,
  requirePythApiKey,
} from "@/server/market-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  try {
    const symbol = new URL(request.url).searchParams.get("symbol") ?? "BTC/USD";
    const config = getMarketDataConfig();
    const createPythAdapter =
      config.mode === "pyth"
        ? () =>
            new PythAdapter({
              apiKey: requirePythApiKey(config),
              channel: config.channel,
            })
        : undefined;
    return createMarketStreamResponse(request, symbol, config, {
      createPythAdapter,
    });
  } catch {
    return Response.json(
      {
        code: "STREAM_UNAVAILABLE",
        message: "Market data streaming is not configured.",
      },
      { status: 503 },
    );
  }
}
