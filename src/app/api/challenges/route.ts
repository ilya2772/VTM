import { NextRequest, NextResponse } from "next/server";

import { requireSession } from "@/server/auth/session";
import { paymentMode } from "@/server/challenges/service";
import { prisma } from "@/server/db/client";
import { errorResponse } from "@/server/http/api-error";
import { getRequestContext } from "@/server/security/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const context = getRequestContext(request);
  try {
    const session = await requireSession(request);
    const [user, products, accounts, payments] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: session.user.id },
        select: { activeAccountId: true },
      }),
      prisma.challengeProduct.findMany({
        where: { isActive: true },
        orderBy: [{ accountSize: "asc" }, { price: "asc" }],
      }),
      prisma.tradingAccount.findMany({
        where: { userId: session.user.id },
        include: {
          challenges: {
            include: { rules: true, product: true },
            orderBy: { createdAt: "desc" },
          },
          equitySnapshots: { orderBy: { capturedAt: "desc" }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.payment.findMany({
        where: { userId: session.user.id },
        include: { product: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return NextResponse.json({
      paymentMode: paymentMode(),
      activeAccountId: user.activeAccountId,
      products: products.map((product) => ({
        id: product.id,
        slug: product.slug,
        name: product.name,
        description: product.description,
        accountSize: product.accountSize.toString(),
        price: product.price.toString(),
        currency: product.currency,
        profitTargetPct: product.profitTargetPct.toString(),
        maxDailyLossPct: product.maxDailyLossPct.toString(),
        maxOverallLossPct: product.maxOverallLossPct.toString(),
        minTradingDays: product.minTradingDays,
        maxLeverage: product.maxLeverage.toString(),
        stages: product.stages,
      })),
      challenges: accounts.flatMap((account) =>
        account.challenges.map((challenge) => ({
          id: challenge.id,
          accountId: account.id,
          name: challenge.product?.name ?? "Legacy challenge",
          status: challenge.status,
          accountSize: account.initialBalance.toString(),
          balance: account.balance.toString(),
          equity:
            account.equitySnapshots[0]?.equity.toString() ??
            account.balance.toString(),
          purchasedAt: (
            challenge.purchasedAt ?? challenge.createdAt
          ).toISOString(),
          tradingDays: challenge.tradingDays,
          stages: challenge.product?.stages ?? 1,
          rules: challenge.rules
            ? {
                profitTargetPct: challenge.rules.profitTargetPct.toString(),
                maxDailyLossPct: challenge.rules.maxDailyLossPct.toString(),
                maxOverallLossPct: challenge.rules.maxOverallLossPct.toString(),
                minTradingDays: challenge.rules.minTradingDays,
                maxLeverage: challenge.rules.maxLeverage.toString(),
              }
            : null,
        })),
      ),
      payments: payments.map((payment) => ({
        id: payment.id,
        productName: payment.product.name,
        status: payment.status,
        amount: payment.amount.toString(),
        currency: payment.currency,
        provider: payment.provider,
        paymentId: payment.providerPaymentId,
        createdAt: payment.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return errorResponse(error, context.requestId);
  }
}
