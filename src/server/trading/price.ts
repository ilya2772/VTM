import "server-only";

import {
  assertConfiguredTickExecutable,
  getConfiguredMarketTick,
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
  try {
    const tick = await getConfiguredMarketTick(instrument.symbol, now);
    assertConfiguredTickExecutable(tick, now);
    return tick;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      503,
      "MARKET_DATA_UNAVAILABLE",
      error instanceof Error && error.message.toLowerCase().includes("stale")
        ? "Market price is stale; new executions are disabled."
        : "Pyth market price is unavailable; new executions are disabled.",
    );
  }
}
