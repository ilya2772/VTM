import { NextRequest, NextResponse } from "next/server";

import { requireSession } from "@/server/auth/session";
import { errorResponse } from "@/server/http/api-error";
import { getRequestContext } from "@/server/security/request-context";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const context = getRequestContext(request);

  try {
    const session = await requireSession(request);

    const response = NextResponse.json({
      user: session.user,
      expiresAt: session.expiresAt.toISOString(),
    });
    response.headers.set("X-Request-Id", context.requestId);
    return response;
  } catch (error) {
    return errorResponse(error, context.requestId);
  }
}
