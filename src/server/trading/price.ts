import "server-only";

import { demoTick } from "@/server/market-data";
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
  if (process.env.MARKET_DATA_MODE !== "demo")
    throw new ApiError(
      503,
      "MARKET_DATA_UNAVAILABLE",
      "Live market data is not configured.",
    );
  return demoTick(instrument.symbol, Math.floor(now.getTime() / 1000), now);
}
