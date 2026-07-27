import { NextRequest, NextResponse } from "next/server";

import { setSessionCookie } from "@/server/auth/cookie";
import { loginSchema } from "@/server/auth/schema";
import { login } from "@/server/auth/service";
import { ApiError, errorResponse } from "@/server/http/api-error";
import { assertSameOrigin } from "@/server/security/csrf";
import {
  assertRateLimit,
  loginEmailRateLimiter,
  loginIpRateLimiter,
} from "@/server/security/rate-limit";
import { getRequestContext } from "@/server/security/request-context";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const context = getRequestContext(request);

  try {
    assertSameOrigin(request);

    const body: unknown = await request.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Email and password are required.",
      );
    }

    const emailKey = parsed.data.email.toLowerCase();
    const ipKey = context.ipAddress ?? "unknown";
    assertRateLimit(loginEmailRateLimiter, emailKey);
    assertRateLimit(loginIpRateLimiter, ipKey);

    const result = await login(parsed.data, context);

    if (!result) {
      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "Invalid email or password.",
      );
    }

    loginEmailRateLimiter.reset(emailKey);

    const response = NextResponse.json({
      user: result.user,
      expiresAt: result.expiresAt.toISOString(),
    });
    response.headers.set("X-Request-Id", context.requestId);
    setSessionCookie(response, result.token);
    return response;
  } catch (error) {
    return errorResponse(error, context.requestId);
  }
}
