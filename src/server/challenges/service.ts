import "server-only";

import { randomUUID } from "node:crypto";

import { prisma } from "@/server/db/client";
import { ApiError } from "@/server/http/api-error";
export { verifyStripeSignature } from "@/server/challenges/stripe-signature";

export function paymentMode(): "stripe" | "mock" {
  return process.env.PAYMENT_MODE === "stripe" ? "stripe" : "mock";
}

export async function createChallengeCheckout(
  userId: string,
  productId: string,
  origin: string,
) {
  const product = await prisma.challengeProduct.findFirst({
    where: { id: productId, isActive: true },
  });
  if (!product)
    throw new ApiError(
      404,
      "PRODUCT_NOT_FOUND",
      "Challenge product not found.",
    );

  const pendingSession = `pending_${randomUUID()}`;
  const payment = await prisma.payment.create({
    data: {
      userId,
      productId: product.id,
      provider: paymentMode() === "stripe" ? "STRIPE_TEST" : "MOCK_TEST",
      providerSessionId: pendingSession,
      amount: product.price,
      currency: product.currency,
    },
  });

  if (paymentMode() === "mock") {
    const sessionId = `mock_${randomUUID()}`;
    await prisma.payment.update({
      where: { id: payment.id },
      data: { providerSessionId: sessionId },
    });
    return {
      paymentId: payment.id,
      sessionId,
      checkoutUrl: `${origin}/challenges/success?session_id=${encodeURIComponent(sessionId)}`,
      mode: "mock" as const,
    };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey?.startsWith("sk_test_"))
    throw new ApiError(
      503,
      "STRIPE_NOT_CONFIGURED",
      "Stripe test mode is not configured.",
    );
  const params = new URLSearchParams({
    mode: "payment",
    success_url: `${origin}/challenges/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/challenges/cancelled`,
    client_reference_id: payment.id,
    "metadata[paymentId]": payment.id,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": product.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": product.price.mul(100).toFixed(0),
    "line_items[0][price_data][product_data][name]": product.name,
  });
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const data: unknown = await response.json().catch(() => null);
  if (
    !response.ok ||
    typeof data !== "object" ||
    data === null ||
    !("id" in data) ||
    !("url" in data) ||
    typeof data.id !== "string" ||
    typeof data.url !== "string"
  ) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED" },
    });
    throw new ApiError(502, "STRIPE_ERROR", "Stripe Checkout is unavailable.");
  }
  await prisma.payment.update({
    where: { id: payment.id },
    data: { providerSessionId: data.id },
  });
  return {
    paymentId: payment.id,
    sessionId: data.id,
    checkoutUrl: data.url,
    mode: "stripe" as const,
  };
}

export async function fulfillChallengePayment(
  providerSessionId: string,
  providerPaymentId: string,
  expectedUserId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { providerSessionId },
      include: { product: true },
    });
    if (!payment)
      throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment not found.");
    if (expectedUserId && payment.userId !== expectedUserId)
      throw new ApiError(
        403,
        "PAYMENT_FORBIDDEN",
        "Payment does not belong to this user.",
      );
    if (payment.status === "PAID")
      return { challengeId: payment.challengeId, replayed: true };
    if (payment.status !== "PENDING")
      throw new ApiError(409, "PAYMENT_NOT_PENDING", "Payment is not pending.");

    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: { status: "PAID", providerPaymentId, paidAt: new Date() },
    });
    if (claimed.count !== 1) {
      const current = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
      return { challengeId: current.challengeId, replayed: true };
    }
    const account = await tx.tradingAccount.create({
      data: {
        userId: payment.userId,
        currency: "USDT",
        initialBalance: payment.product.accountSize,
        balance: payment.product.accountSize,
      },
    });
    const challenge = await tx.challenge.create({
      data: {
        accountId: account.id,
        productId: payment.productId,
        status: "READY",
        peakEquity: payment.product.accountSize,
        dailyStartingEquity: payment.product.accountSize,
        purchasedAt: new Date(),
        rules: {
          create: {
            initialBalance: payment.product.accountSize,
            profitTargetPct: payment.product.profitTargetPct,
            maxDailyLossPct: payment.product.maxDailyLossPct,
            maxOverallLossPct: payment.product.maxOverallLossPct,
            minTradingDays: payment.product.minTradingDays,
            maxLeverage: payment.product.maxLeverage,
            maxPositionNotional: payment.product.maxPositionNotional,
            timezone: "UTC",
          },
        },
      },
    });
    await tx.payment.update({
      where: { id: payment.id },
      data: { challengeId: challenge.id },
    });
    return { challengeId: challenge.id, replayed: false };
  });
}

export async function activateChallenge(userId: string, challengeId: string) {
  return prisma.$transaction(async (tx) => {
    const challenge = await tx.challenge.findFirst({
      where: { id: challengeId, account: { userId } },
      include: { account: true },
    });
    if (!challenge)
      throw new ApiError(404, "CHALLENGE_NOT_FOUND", "Challenge not found.");
    if (challenge.status !== "READY" && challenge.status !== "ACTIVE")
      throw new ApiError(
        409,
        "CHALLENGE_NOT_ACTIVATABLE",
        "This challenge cannot be activated.",
      );
    await tx.challenge.updateMany({
      where: {
        account: { userId },
        status: "ACTIVE",
        id: { not: challenge.id },
      },
      data: { status: "READY" },
    });
    await tx.challenge.update({
      where: { id: challenge.id },
      data: { status: "ACTIVE" },
    });
    await tx.user.update({
      where: { id: userId },
      data: { activeAccountId: challenge.accountId },
    });
    return { challengeId: challenge.id, accountId: challenge.accountId };
  });
}
