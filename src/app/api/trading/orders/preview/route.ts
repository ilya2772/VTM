import { NextRequest, NextResponse } from "next/server";

import { requireSession } from "@/server/auth/session";
import { ApiError, errorResponse } from "@/server/http/api-error";
import { assertSameOrigin } from "@/server/security/csrf";
import { getRequestContext } from "@/server/security/request-context";
import { getAuthoritativeTick } from "@/server/trading/price";
import { previewOrderSchema } from "@/server/trading/schema";
import { previewOrder } from "@/server/trading/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const context = getRequestContext(request);
  try {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const parsed = previewOrderSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Order preview input is invalid.",
      );
    const now = new Date();
    const tick = await getAuthoritativeTick(parsed.data.instrumentId, now);
    const preview = await previewOrder(
      { ...parsed.data, userId: session.user.id },
      tick,
      now,
    );
    return NextResponse.json(preview, {
      headers: {
        "Cache-Control": "no-store",
        "X-Request-Id": context.requestId,
      },
    });
  } catch (error) {
    return errorResponse(error, context.requestId);
  }
}
