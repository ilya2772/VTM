import {
  aggregateTicks,
  demoTick,
  getMarketDataConfig,
  PythAdapter,
  requirePythApiKey,
  type Candle,
} from "@/server/market-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const resolutions = new Map<string, number>([
  ["1", 60_000],
  ["2", 120_000],
  ["5", 300_000],
  ["15", 900_000],
  ["30", 1_800_000],
  ["60", 3_600_000],
  ["120", 7_200_000],
  ["240", 14_400_000],
  ["360", 21_600_000],
  ["720", 43_200_000],
  ["D", 86_400_000],
  ["W", 604_800_000],
  ["M", 2_592_000_000],
]);

function serializeCandles(candles: readonly Candle[]) {
  return candles.map((candle) => ({
    time: Math.floor(candle.time.getTime() / 1_000),
    open: candle.open.toString(),
    high: candle.high.toString(),
    low: candle.low.toString(),
    close: candle.close.toString(),
    volume: null,
  }));
}

function demoHistory(
  symbol: string,
  from: Date,
  to: Date,
  intervalMs: number,
): Candle[] {
  const ticks = [];
  const start = Math.ceil(from.getTime() / intervalMs) * intervalMs;
  const maximum = 500;
  for (
    let timestamp = start, sequence = 0;
    timestamp <= to.getTime() && sequence < maximum;
    timestamp += intervalMs, sequence += 1
  )
    ticks.push(demoTick(symbol, sequence, new Date(timestamp)));
  return aggregateTicks(ticks, intervalMs);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const symbol = url.searchParams.get("symbol") ?? "BTC/USD";
    const resolution = url.searchParams.get("resolution") ?? "15";
    const intervalMs = resolutions.get(resolution);
    const fromSeconds = Number(url.searchParams.get("from"));
    const toSeconds = Number(url.searchParams.get("to"));
    if (
      !intervalMs ||
      !Number.isSafeInteger(fromSeconds) ||
      !Number.isSafeInteger(toSeconds) ||
      fromSeconds >= toSeconds ||
      toSeconds - fromSeconds > 31 * 86_400
    )
      return Response.json(
        { code: "HISTORY_INPUT_INVALID", message: "History input is invalid." },
        { status: 400 },
      );
    const from = new Date(fromSeconds * 1_000);
    const to = new Date(toSeconds * 1_000);
    const config = getMarketDataConfig();
    const candles =
      config.mode === "demo"
        ? demoHistory(symbol, from, to, intervalMs)
        : await new PythAdapter({
            apiKey: requirePythApiKey(config),
            channel: config.channel,
          }).getHistory(symbol, from, to, resolution);
    return Response.json({
      source: config.mode === "demo" ? "DEMO" : "PYTH",
      symbol,
      resolution,
      candles: serializeCandles(candles),
    });
  } catch {
    return Response.json(
      {
        code: "HISTORY_UNAVAILABLE",
        message: "Market history is unavailable.",
      },
      { status: 503 },
    );
  }
}
