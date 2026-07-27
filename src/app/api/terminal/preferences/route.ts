import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";
import { ApiError, errorResponse } from "@/server/http/api-error";
import { assertSameOrigin } from "@/server/security/csrf";
import { getRequestContext } from "@/server/security/request-context";
import {
  assertRateLimit,
  preferenceMutationRateLimiter,
} from "@/server/security/rate-limit";
import { chartResolutions } from "@/shared/chart";

export const runtime = "nodejs";

const preferenceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("WATCHLIST"),
    instrumentId: z.string().min(1),
    enabled: z.boolean(),
  }),
  z.object({
    kind: z.literal("CHART_LAYOUT"),
    symbol: z.string().min(1).max(32),
    timeframe: z.enum(chartResolutions),
    chartType: z.enum(["Candles", "Bars", "Line", "Area", "Heikin Ashi"]),
    theme: z.enum(["dark", "light"]),
  }),
]);

export async function PUT(request: NextRequest) {
  const context = getRequestContext(request);
  try {
    assertSameOrigin(request);
    const session = await requireSession(request);
    assertRateLimit(preferenceMutationRateLimiter, session.user.id);
    const parsed = preferenceSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiError(400, "INVALID_PREFERENCE", "Invalid preference data.");

    if (parsed.data.kind === "WATCHLIST") {
      const instrument = await prisma.instrument.findFirst({
        where: { id: parsed.data.instrumentId, isActive: true },
        select: { id: true },
      });
      if (!instrument)
        throw new ApiError(
          404,
          "INSTRUMENT_NOT_FOUND",
          "Instrument not found.",
        );
      if (parsed.data.enabled) {
        await prisma.watchlist.upsert({
          where: {
            userId_instrumentId: {
              userId: session.user.id,
              instrumentId: instrument.id,
            },
          },
          create: { userId: session.user.id, instrumentId: instrument.id },
          update: {},
        });
      } else {
        await prisma.watchlist.deleteMany({
          where: { userId: session.user.id, instrumentId: instrument.id },
        });
      }
      return NextResponse.json({
        instrumentId: instrument.id,
        enabled: parsed.data.enabled,
      });
    }

    const instrument = await prisma.instrument.findFirst({
      where: { symbol: parsed.data.symbol, isActive: true },
      select: { symbol: true },
    });
    if (!instrument)
      throw new ApiError(404, "INSTRUMENT_NOT_FOUND", "Instrument not found.");
    const layout = await prisma.chartLayout.upsert({
      where: { userId_name: { userId: session.user.id, name: "default" } },
      create: {
        userId: session.user.id,
        name: "default",
        symbol: instrument.symbol,
        timeframe: parsed.data.timeframe,
        engine: "lightweight",
        payload: { chartType: parsed.data.chartType, theme: parsed.data.theme },
      },
      update: {
        symbol: instrument.symbol,
        timeframe: parsed.data.timeframe,
        engine: "lightweight",
        payload: { chartType: parsed.data.chartType, theme: parsed.data.theme },
      },
    });
    return NextResponse.json({ id: layout.id, saved: true });
  } catch (error) {
    return errorResponse(error, context.requestId);
  }
}
