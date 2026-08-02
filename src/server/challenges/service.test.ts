import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifyStripeSignature } from "./stripe-signature";

describe("verifyStripeSignature", () => {
  it("accepts a current valid signature and rejects tampering", () => {
    const payload = '{"type":"checkout.session.completed"}';
    const timestamp = 2_000_000_000;
    const secret = "whsec_test";
    const digest = createHmac("sha256", secret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");
    const header = `t=${timestamp},v1=${digest}`;
    expect(verifyStripeSignature(payload, header, secret, timestamp)).toBe(
      true,
    );
    expect(
      verifyStripeSignature(`${payload}x`, header, secret, timestamp),
    ).toBe(false);
  });

  it("rejects replayed old webhook signatures", () => {
    expect(verifyStripeSignature("{}", "t=1,v1=abc", "secret", 1000)).toBe(
      false,
    );
  });
});
