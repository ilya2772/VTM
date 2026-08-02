import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/server/auth/session";
import { createChallengeCheckout } from "@/server/challenges/service";
import { ApiError, errorResponse } from "@/server/http/api-error";
import { assertSameOrigin } from "@/server/security/csrf";
import { getRequestContext } from "@/server/security/request-context";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const context = getRequestContext(request);
  try {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const parsed = z
      .object({ productId: z.string().min(1).max(128) })
      .safeParse(await request.json());
    if (!parsed.success)
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Challenge product is invalid.",
      );
    const origin = process.env.APP_URL || request.nextUrl.origin;
    return NextResponse.json(
      await createChallengeCheckout(
        session.user.id,
        parsed.data.productId,
        origin,
      ),
    );
  } catch (error) {
    return errorResponse(error, context.requestId);
  }
}
