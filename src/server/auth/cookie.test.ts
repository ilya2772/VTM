// @vitest-environment node

import { NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { clearSessionCookie, setSessionCookie } from "./cookie";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("session cookie", () => {
  it("is HttpOnly, same-site, path-scoped, and secure in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = NextResponse.json({ ok: true });

    setSessionCookie(response, "secret-session-token");

    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("axiom_session=secret-session-token");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Path=/");
  });

  it("clears the session with the same security scope", () => {
    const response = NextResponse.json({ ok: true });

    clearSessionCookie(response);

    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("axiom_session=");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Path=/");
  });
});
