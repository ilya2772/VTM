// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { assertSameOrigin } from "./csrf";

describe("assertSameOrigin", () => {
  it("accepts a matching origin", () => {
    const request = new Request("https://terminal.example/api/auth/login", {
      method: "POST",
      headers: { origin: "https://terminal.example" },
    });

    expect(() => assertSameOrigin(request)).not.toThrow();
  });

  it("rejects missing and cross-origin requests", () => {
    const missingOrigin = new Request(
      "https://terminal.example/api/auth/login",
      {
        method: "POST",
      },
    );
    const crossOrigin = new Request("https://terminal.example/api/auth/login", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    });

    expect(() => assertSameOrigin(missingOrigin)).toThrowError("not allowed");
    expect(() => assertSameOrigin(crossOrigin)).toThrowError("not allowed");
  });

  it("does not trust client-supplied forwarded origin headers", () => {
    const request = new Request("http://internal:3000/api/auth/login", {
      method: "POST",
      headers: {
        origin: "https://terminal.example",
        "x-forwarded-host": "terminal.example",
        "x-forwarded-proto": "https",
      },
    });

    expect(() => assertSameOrigin(request)).toThrowError("not allowed");
  });
});
