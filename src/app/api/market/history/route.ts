import { z } from "zod";

import { demoHistory } from "@/server/market-data/history";
import { chartResolutions } from "@/shared/chart";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  symbol: z.enum(["BTC/USD", "ETH/USD", "SOL/USD", "XRP/USD"]),
  resolution: z.enum(chartResolutions),
  from: z.coerce.number().int().nonnegative(),
  to: z.coerce.number().int().positive(),
  countBack: z.coerce.number().int().min(1).max(500).default(300),
});

export function GET(request: Request) {
  if (process.env.MARKET_DATA_MODE !== "demo") {
    return Response.json(
      {
        code: "HISTORY_UNAVAILABLE",
        message: "Historical data requires a configured market-data source.",
      },
      { status: 503 },
    );
  }
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return Response.json(
      {
        code: "INVALID_HISTORY_QUERY",
        message: "Invalid chart history query.",
      },
      { status: 400 },
    );
  }
  const { symbol, resolution, from, to, countBack } = parsed.data;
  return Response.json({
    bars: demoHistory(symbol, resolution, from, to, countBack),
    source: "DEMO",
  });
}
