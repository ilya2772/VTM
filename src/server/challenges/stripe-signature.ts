import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const entries = signature.split(",").map((part) => part.split("="));
  const timestamp = entries.find(([key]) => key === "t")?.[1];
  const candidates = entries
    .filter(([key]) => key === "v1")
    .map(([, value]) => value)
    .filter((item): item is string => Boolean(item));
  if (!timestamp || !/^\d+$/.test(timestamp) || candidates.length === 0)
    return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return candidates.some((candidate) => {
    const actualBuffer = Buffer.from(candidate);
    const expectedBuffer = Buffer.from(expected);
    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    );
  });
}
