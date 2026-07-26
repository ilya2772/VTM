import "server-only";

import type { NextRequest } from "next/server";

import { ApiError } from "@/server/http/api-error";
import type { RequestContext } from "@/server/security/request-context";
import { SESSION_COOKIE_NAME } from "./config";
import { prismaAuthRepository, type AuthRepository } from "./repository";
import { hashSessionToken } from "./token";

export async function getSession(
  request: NextRequest,
  repository: AuthRepository = prismaAuthRepository,
  now = new Date(),
) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  return repository.findActiveSession(hashSessionToken(token), now);
}

export async function requireSession(
  request: NextRequest,
  repository: AuthRepository = prismaAuthRepository,
) {
  const session = await getSession(request, repository);

  if (!session) {
    throw new ApiError(401, "UNAUTHENTICATED", "Authentication is required.");
  }

  return session;
}

export async function logout(
  request: NextRequest,
  context: RequestContext,
  repository: AuthRepository = prismaAuthRepository,
) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return;

  await repository.revokeSession(hashSessionToken(token), context);
}
