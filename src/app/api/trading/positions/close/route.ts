import { NextRequest, NextResponse } from "next/server";

import { requireSession } from "@/server/auth/session";
import { ApiError, errorResponse } from "@/server/http/api-error";
import { assertSameOrigin } from "@/server/security/csrf";
import { getRequestContext } from "@/server/security/request-context";
import {
  assertRateLimit,
  tradingMutationRateLimiter,
} from "@/server/security/rate-limit";
import { getAuthoritativeTick } from "@/server/trading/price";
import { closePositionSchema } from "@/server/trading/schema";
import { closeTradingPosition } from "@/server/trading/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const context = getRequestContext(request);
  try {
    assertSameOrigin(request);
    const session = await requireSession(request);
    assertRateLimit(tradingMutationRateLimiter, session.user.id);
    const parsed = closePositionSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiError(400, "VALIDATION_ERROR", "Close input is invalid.");
    const now = new Date();
    const tick = await getAuthoritativeTick(parsed.data.instrumentId, now);
    const result = await closeTradingPosition(
      {
        userId: session.user.id,
        accountId: parsed.data.accountId,
        positionId: parsed.data.positionId,
        quantity: parsed.data.quantity,
        idempotencyKey: parsed.data.idempotencyKey,
        requestId: context.requestId,
      },
      tick,
      now,
    );
    return NextResponse.json(
      {
        orderId: result.order.id,
        status: result.order.status,
        replayed: result.replayed,
      },
      {
        status: result.replayed ? 200 : 201,
        headers: { "X-Request-Id": context.requestId },
      },
    );
  } catch (error) {
    return errorResponse(error, context.requestId);
  }
}
