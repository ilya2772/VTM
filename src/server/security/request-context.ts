import "server-only";

import { randomUUID } from "node:crypto";

const MAX_IP_LENGTH = 64;
const MAX_USER_AGENT_LENGTH = 512;

export type RequestContext = Readonly<{
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}>;

function truncate(value: string | null, maxLength: number) {
  return value ? value.slice(0, maxLength) : null;
}

export function getRequestContext(request: Request): RequestContext {
  const forwardedFor = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const ipAddress = forwardedFor || request.headers.get("x-real-ip");

  return {
    requestId:
      request.headers.get("x-request-id")?.slice(0, 128) || randomUUID(),
    ipAddress: truncate(ipAddress, MAX_IP_LENGTH),
    userAgent: truncate(
      request.headers.get("user-agent"),
      MAX_USER_AGENT_LENGTH,
    ),
  };
}
