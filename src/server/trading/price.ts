import "server-only";

import {
  assertExecutableTick,
  demoTick,
  getMarketDataConfig,
  PythAdapter,
  requirePythApiKey,
} from "@/server/market-data";
import { prisma } from "@/server/db/client";
import { ApiError } from "@/server/http/api-error";

export async function getAuthoritativeTick(
  instrumentId: string,
  now = new Date(),
) {
  const instrument = await prisma.instrument.findUnique({
    where: { id: instrumentId },
  });
  if (!instrument?.isActive)
    throw new ApiError(
      404,
      "INSTRUMENT_NOT_FOUND",
      "Instrument is unavailable.",
    );
  const config = getMarketDataConfig();
  if (config.mode === "demo")
    return demoTick(instrument.symbol, Math.floor(now.getTime() / 1000), now);
  try {
    const tick = await new PythAdapter({
      apiKey: requirePythApiKey(config),
      channel: config.channel,
    }).getLatestTick(instrument.symbol);
    assertExecutableTick(tick, now, config.staleAfterMs);
    return tick;
  } catch {
    throw new ApiError(
      503,
      "MARKET_DATA_UNAVAILABLE",
      "Live market price is unavailable or stale.",
    );
  }
}
