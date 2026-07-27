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
import { updatePositionTargetsSchema } from "@/server/trading/schema";
import { updatePositionTargets } from "@/server/trading/service";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  const context = getRequestContext(request);
  try {
    assertSameOrigin(request);
    const session = await requireSession(request);
    assertRateLimit(tradingMutationRateLimiter, session.user.id);
    const parsed = updatePositionTargetsSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Position targets are invalid.",
      );
    const now = new Date();
    const tick = await getAuthoritativeTick(parsed.data.instrumentId, now);
    const position = await updatePositionTargets(
      {
        userId: session.user.id,
        accountId: parsed.data.accountId,
        positionId: parsed.data.positionId,
        stopLoss: parsed.data.stopLoss,
        takeProfit: parsed.data.takeProfit,
        requestId: context.requestId,
      },
      tick,
      now,
    );
    return NextResponse.json(
      {
        positionId: position.id,
        stopLoss: position.stopLoss?.toString() ?? null,
        takeProfit: position.takeProfit?.toString() ?? null,
      },
      { headers: { "X-Request-Id": context.requestId } },
    );
  } catch (error) {
    return errorResponse(error, context.requestId);
  }
}
