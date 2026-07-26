import "server-only";

import { ApiError } from "@/server/http/api-error";

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");

  if (!origin || origin !== new URL(request.url).origin) {
    throw new ApiError(
      403,
      "CSRF_REJECTED",
      "The request origin is not allowed.",
    );
  }
}
