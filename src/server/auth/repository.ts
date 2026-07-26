import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/client";
import type { RequestContext } from "@/server/security/request-context";

export type AuthUserRecord = Readonly<{
  id: string;
  email: string;
  displayName: string;
  passwordHash: string | null;
}>;

export type ActiveSession = Readonly<{
  id: string;
  expiresAt: Date;
  user: Omit<AuthUserRecord, "passwordHash">;
}>;

export interface AuthRepository {
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  recordLoginFailure(email: string, context: RequestContext): Promise<void>;
  createSession(input: {
    user: Omit<AuthUserRecord, "passwordHash">;
    tokenHash: string;
    expiresAt: Date;
    context: RequestContext;
  }): Promise<void>;
  findActiveSession(
    tokenHash: string,
    now: Date,
  ): Promise<ActiveSession | null>;
  revokeSession(tokenHash: string, context: RequestContext): Promise<void>;
}

function auditMetadata(
  context: RequestContext,
  extra?: Prisma.InputJsonObject,
) {
  return {
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    ...extra,
  } satisfies Prisma.InputJsonObject;
}

export const prismaAuthRepository: AuthRepository = {
  findUserByEmail(email) {
    return prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, displayName: true, passwordHash: true },
    });
  },

  async recordLoginFailure(email, context) {
    await prisma.auditLog.create({
      data: {
        action: "AUTH_LOGIN_FAILED",
        entityType: "User",
        requestId: context.requestId,
        metadata: auditMetadata(context, { email }),
      },
    });
  },

  async createSession({ user, tokenHash, expiresAt, context }) {
    await prisma.$transaction([
      prisma.session.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      }),
      prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "AUTH_LOGIN_SUCCEEDED",
          entityType: "Session",
          requestId: context.requestId,
          metadata: auditMetadata(context),
        },
      }),
    ]);
  },

  findActiveSession(tokenHash, now) {
    return prisma.session.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        expiresAt: true,
        user: {
          select: { id: true, email: true, displayName: true },
        },
      },
    });
  },

  async revokeSession(tokenHash, context) {
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, revokedAt: true },
    });

    if (!session || session.revokedAt) return;

    await prisma.$transaction([
      prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          userId: session.userId,
          action: "AUTH_LOGOUT",
          entityType: "Session",
          entityId: session.id,
          requestId: context.requestId,
          metadata: auditMetadata(context),
        },
      }),
    ]);
  },
};
