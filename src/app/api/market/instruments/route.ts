import {
  getMarketDataConfig,
  PythAdapter,
  requirePythApiKey,
} from "@/server/market-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const demoInstruments = [
  {
    feedId: null,
    pythSymbol: null,
    symbol: "BTC/USD",
    displayName: "Bitcoin / US Dollar",
    assetType: "crypto",
    exponent: null,
    minChannel: null,
    status: "DEMO",
  },
  {
    feedId: null,
    pythSymbol: null,
    symbol: "ETH/USD",
    displayName: "Ether / US Dollar",
    assetType: "crypto",
    exponent: null,
    minChannel: null,
    status: "DEMO",
  },
];

export async function GET(request: Request) {
  try {
    const config = getMarketDataConfig();
    if (config.mode === "demo")
      return Response.json({ source: "DEMO", instruments: demoInstruments });
    const query = new URL(request.url).searchParams.get("query") ?? undefined;
    const adapter = new PythAdapter({
      apiKey: requirePythApiKey(config),
      channel: config.channel,
    });
    const instruments = await adapter.getInstruments(query);
    return Response.json({ source: "PYTH", instruments });
  } catch {
    return Response.json(
      {
        code: "INSTRUMENTS_UNAVAILABLE",
        message: "Market instruments are unavailable.",
      },
      { status: 503 },
    );
  }
}
