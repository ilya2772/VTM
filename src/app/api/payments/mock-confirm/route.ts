import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/server/auth/session";
import {
  fulfillChallengePayment,
  paymentMode,
} from "@/server/challenges/service";
import { ApiError, errorResponse } from "@/server/http/api-error";
import { assertSameOrigin } from "@/server/security/csrf";
import { getRequestContext } from "@/server/security/request-context";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const context = getRequestContext(request);
  try {
    assertSameOrigin(request);
    const session = await requireSession(request);
    if (paymentMode() !== "mock")
      throw new ApiError(404, "NOT_FOUND", "Mock payments are disabled.");
    const parsed = z
      .object({ sessionId: z.string().startsWith("mock_").max(128) })
      .safeParse(await request.json());
    if (!parsed.success)
      throw new ApiError(400, "VALIDATION_ERROR", "Mock session is invalid.");
    return NextResponse.json(
      await fulfillChallengePayment(
        parsed.data.sessionId,
        `mock_payment_${parsed.data.sessionId.slice(5)}`,
        session.user.id,
      ),
    );
  } catch (error) {
    return errorResponse(error, context.requestId);
  }
}
