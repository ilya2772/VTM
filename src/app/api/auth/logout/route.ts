import { NextRequest, NextResponse } from "next/server";

import { clearSessionCookie } from "@/server/auth/cookie";
import { logout } from "@/server/auth/session";
import { errorResponse } from "@/server/http/api-error";
import { assertSameOrigin } from "@/server/security/csrf";
import { getRequestContext } from "@/server/security/request-context";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const context = getRequestContext(request);

  try {
    assertSameOrigin(request);
    await logout(request, context);

    const response = new NextResponse(null, { status: 204 });
    response.headers.set("X-Request-Id", context.requestId);
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return errorResponse(error, context.requestId);
  }
}
