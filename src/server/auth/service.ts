import "server-only";

import type { LoginInput } from "./schema";
import { getSessionTtlSeconds } from "./config";
import { verifyPassword } from "./password";
import {
  prismaAuthRepository,
  type AuthRepository,
  type AuthUserRecord,
} from "./repository";
import { createSessionToken, hashSessionToken } from "./token";
import type { RequestContext } from "@/server/security/request-context";

const DUMMY_PASSWORD_HASH =
  "scrypt$16384$8$1$AeWk9G_BPyWpWNV2edlLnA$Bs2CnQXYojDddTFhcci0RwIJcg4_VYBEqnU1cxZYRypBWRydcEuMzKM1IbggGAjZdPJE0-EEedJgHxKfDNxTGg";

export type LoginResult = Readonly<{
  token: string;
  user: Omit<AuthUserRecord, "passwordHash">;
  expiresAt: Date;
}>;

export async function login(
  input: LoginInput,
  context: RequestContext,
  repository: AuthRepository = prismaAuthRepository,
  now = new Date(),
): Promise<LoginResult | null> {
  const user = await repository.findUserByEmail(input.email);
  const passwordMatches = await verifyPassword(
    input.password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user?.passwordHash || !passwordMatches) {
    await repository.recordLoginFailure(input.email, context);
    return null;
  }

  const token = createSessionToken();
  const expiresAt = new Date(now.getTime() + getSessionTtlSeconds() * 1_000);
  const publicUser = {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  };

  await repository.createSession({
    user: publicUser,
    tokenHash: hashSessionToken(token),
    expiresAt,
    context,
  });

  return { token, user: publicUser, expiresAt };
}
