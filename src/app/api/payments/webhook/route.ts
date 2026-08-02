import { NextRequest, NextResponse } from "next/server";

import {
  fulfillChallengePayment,
  verifyStripeSignature,
} from "@/server/challenges/service";
import { ApiError, errorResponse } from "@/server/http/api-error";
import { getRequestContext } from "@/server/security/request-context";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const context = getRequestContext(request);
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = request.headers.get("stripe-signature");
    const payload = await request.text();
    if (
      !secret ||
      !signature ||
      !verifyStripeSignature(payload, signature, secret)
    )
      throw new ApiError(
        400,
        "INVALID_SIGNATURE",
        "Invalid Stripe webhook signature.",
      );
    const event: unknown = JSON.parse(payload);
    if (
      typeof event !== "object" ||
      event === null ||
      !("type" in event) ||
      !("data" in event)
    )
      throw new ApiError(400, "INVALID_EVENT", "Invalid Stripe event.");
    if (event.type !== "checkout.session.completed")
      return NextResponse.json({ received: true });
    const data = event.data;
    if (typeof data !== "object" || data === null || !("object" in data))
      throw new ApiError(400, "INVALID_EVENT", "Invalid Stripe session event.");
    const session = data.object;
    if (
      typeof session !== "object" ||
      session === null ||
      !("id" in session) ||
      typeof session.id !== "string"
    )
      throw new ApiError(400, "INVALID_EVENT", "Stripe session ID is missing.");
    const paymentIntent =
      "payment_intent" in session && typeof session.payment_intent === "string"
        ? session.payment_intent
        : `checkout_${session.id}`;
    return NextResponse.json(
      await fulfillChallengePayment(session.id, paymentIntent),
    );
  } catch (error) {
    return errorResponse(error, context.requestId);
  }
}
