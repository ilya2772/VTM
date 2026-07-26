// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { RequestContext } from "@/server/security/request-context";
import type {
  ActiveSession,
  AuthRepository,
  AuthUserRecord,
} from "./repository";
import { login } from "./service";

const passwordHash =
  "scrypt$16384$8$1$AeWk9G_BPyWpWNV2edlLnA$Bs2CnQXYojDddTFhcci0RwIJcg4_VYBEqnU1cxZYRypBWRydcEuMzKM1IbggGAjZdPJE0-EEedJgHxKfDNxTGg";

const user: AuthUserRecord = {
  id: "demo-user",
  email: "demo@axiom.local",
  displayName: "Demo Trader",
  passwordHash,
};

const context: RequestContext = {
  requestId: "request-1",
  ipAddress: "127.0.0.1",
  userAgent: "Vitest",
};

function createRepository(foundUser: AuthUserRecord | null) {
  const createdSessions: Array<{ tokenHash: string; expiresAt: Date }> = [];
  const failedEmails: string[] = [];

  const repository: AuthRepository = {
    async findUserByEmail() {
      return foundUser;
    },
    async recordLoginFailure(email) {
      failedEmails.push(email);
    },
    async createSession(input) {
      createdSessions.push({
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      });
    },
    async findActiveSession(): Promise<ActiveSession | null> {
      return null;
    },
    async revokeSession() {},
  };

  return { repository, createdSessions, failedEmails };
}

describe("login", () => {
  it("creates a hashed server session for valid credentials", async () => {
    const state = createRepository(user);
    const result = await login(
      { email: user.email, password: "AxiomDemo!2026" },
      context,
      state.repository,
      new Date("2026-07-25T00:00:00.000Z"),
    );

    expect(result?.user).toEqual({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    });
    expect(result?.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(state.createdSessions).toHaveLength(1);
    expect(state.createdSessions[0]?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(state.createdSessions[0]?.tokenHash).not.toBe(result?.token);
    expect(state.failedEmails).toEqual([]);
  });

  it("returns one generic failure path and records an audit event", async () => {
    const state = createRepository(null);
    const result = await login(
      { email: "missing@axiom.local", password: "incorrect-password" },
      context,
      state.repository,
    );

    expect(result).toBeNull();
    expect(state.createdSessions).toEqual([]);
    expect(state.failedEmails).toEqual(["missing@axiom.local"]);
  });
});
