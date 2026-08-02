import { NextRequest, NextResponse } from "next/server";

import { requireSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";
import { errorResponse } from "@/server/http/api-error";
import { getConfiguredMarketTick } from "@/server/market-data";
import { getRequestContext } from "@/server/security/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const context = getRequestContext(request);
  try {
    await requireSession(request);
    const instruments = await prisma.instrument.findMany({
      where: { isActive: true },
      select: { id: true, symbol: true },
      orderBy: { symbol: "asc" },
    });
    const prices = await Promise.all(
      instruments.map(async (instrument) => {
        try {
          const tick = await getConfiguredMarketTick(instrument.symbol);
          return {
            instrumentId: instrument.id,
            price: tick.price,
            status: tick.status,
          };
        } catch {
          return { instrumentId: instrument.id, price: null, status: "ERROR" };
        }
      }),
    );
    return NextResponse.json({ prices });
  } catch (error) {
    return errorResponse(error, context.requestId);
  }
}
