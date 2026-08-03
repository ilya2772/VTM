import { NextRequest, NextResponse } from "next/server";

import { Decimal } from "@/server/execution";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";
import { calculatePnl } from "@/server/execution";
import {
  assertConfiguredTickExecutable,
  getConfiguredMarketTick,
} from "@/server/market-data";
import { errorResponse } from "@/server/http/api-error";
import { getRequestContext } from "@/server/security/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const context = getRequestContext(request);
  try {
    const session = await requireSession(request);
    const now = new Date();
    const owner = await prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { activeAccountId: true },
    });
    const account = await prisma.tradingAccount.findFirstOrThrow({
      where: {
        userId: session.user.id,
        ...(owner.activeAccountId ? { id: owner.activeAccountId } : {}),
      },
      orderBy: { createdAt: "asc" },
      include: {
        challenges: {
          orderBy: { startedAt: "desc" },
          take: 1,
          include: {
            rules: true,
            violations: {
              where: { resolvedAt: null },
              orderBy: { occurredAt: "desc" },
            },
          },
        },
        positions: {
          where: { status: "OPEN" },
          include: { instrument: true },
          orderBy: { openedAt: "desc" },
        },
        orders: {
          where: { status: { in: ["PENDING", "OPEN", "PARTIALLY_FILLED"] } },
          include: { instrument: true },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        trades: {
          include: { instrument: true },
          orderBy: { openedAt: "desc" },
          take: 10,
        },
      },
    });
    const instruments = await prisma.instrument.findMany({
      where: { isActive: true },
      orderBy: { symbol: "asc" },
    });
    const [watchlist, chartLayout, leaderboardAccounts] = await Promise.all([
      prisma.watchlist.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "asc" },
        select: { instrumentId: true },
      }),
      prisma.chartLayout.findUnique({
        where: { userId_name: { userId: session.user.id, name: "default" } },
      }),
      prisma.tradingAccount.findMany({
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { id: true, displayName: true } },
          challenges: { orderBy: { startedAt: "desc" }, take: 1 },
        },
      }),
    ]);
    const positionSymbols = [
      ...new Set(
        account.positions.map((position) => position.instrument.symbol),
      ),
    ];
    const markEntries = await Promise.all(
      positionSymbols.map(async (symbol) => {
        try {
          const tick = await getConfiguredMarketTick(symbol, now);
          assertConfiguredTickExecutable(tick, now);
          return [symbol, tick] as const;
        } catch {
          return [symbol, null] as const;
        }
      }),
    );
    const marks = new Map(markEntries);
    const positions = account.positions.map((position) => {
      const liveTick = marks.get(position.instrument.symbol) ?? null;
      const mark = liveTick?.price ?? position.entryPrice;
      const unrealizedPnl = calculatePnl({
        side: position.side,
        quantity: position.quantity.toString(),
        entryPrice: position.entryPrice.toString(),
        exitPrice: mark,
      });
      return {
        id: position.id,
        instrumentId: position.instrumentId,
        symbol: position.instrument.symbol,
        side: position.side,
        quantity: position.quantity.toString(),
        entryPrice: position.entryPrice.toString(),
        markPrice: mark.toString(),
        markAvailable: liveTick !== null,
        leverage: position.leverage.toString(),
        liquidationPrice: position.liquidationPrice?.toString() ?? null,
        stopLoss: position.stopLoss?.toString() ?? null,
        takeProfit: position.takeProfit?.toString() ?? null,
        unrealizedPnl: unrealizedPnl.toString(),
      };
    });
    const totalUnrealized = positions.reduce(
      (sum, position) => sum.plus(position.unrealizedPnl),
      new Decimal(0),
    );
    const equity = new Decimal(account.balance.toString()).plus(
      totalUnrealized,
    );
    const challenge = account.challenges[0];
    const dailyStart = new Decimal(
      challenge?.dailyStartingEquity.toString() ??
        account.initialBalance.toString(),
    );
    const initialBalance = new Decimal(account.initialBalance.toString());
    const dailyDrawdownPct = dailyStart.isZero()
      ? new Decimal(0)
      : Decimal.max(dailyStart.minus(equity), 0).div(dailyStart).mul(100);
    const overallDrawdownPct = Decimal.max(initialBalance.minus(equity), 0)
      .div(initialBalance)
      .mul(100);
    return NextResponse.json({
      marketDataMode:
        process.env.MARKET_DATA_MODE === "demo"
          ? "DEMO"
          : process.env.MARKET_DATA_MODE === "pyth"
            ? "PYTH"
            : "UNAVAILABLE",
      user: session.user,
      account: {
        id: account.id,
        status: account.status,
        currency: account.currency,
        initialBalance: account.initialBalance.toString(),
        balance: account.balance.toString(),
        equity: equity.toString(),
        unrealizedPnl: totalUnrealized.toString(),
      },
      challenge: challenge
        ? {
            id: challenge.id,
            status: challenge.status,
            peakEquity: challenge.peakEquity.toString(),
            dailyStartingEquity: challenge.dailyStartingEquity.toString(),
            tradingDays: challenge.tradingDays,
            rules: challenge.rules
              ? {
                  profitTargetPct: challenge.rules.profitTargetPct.toString(),
                  maxDailyLossPct: challenge.rules.maxDailyLossPct.toString(),
                  maxOverallLossPct:
                    challenge.rules.maxOverallLossPct.toString(),
                  minTradingDays: challenge.rules.minTradingDays,
                  timezone: challenge.rules.timezone,
                  maxLeverage: challenge.rules.maxLeverage.toString(),
                }
              : null,
            violations: challenge.violations.map((violation) => ({
              id: violation.id,
              type: violation.type,
              message: violation.message,
              blocksTrading: violation.blocksTrading,
            })),
          }
        : null,
      instruments: instruments.map((instrument) => ({
        id: instrument.id,
        symbol: instrument.symbol,
        displayName: instrument.displayName,
        baseAsset: instrument.baseAsset,
        quoteAsset: instrument.quoteAsset,
        source: instrument.source,
      })),
      positions,
      risk: {
        dailyDrawdownPct: dailyDrawdownPct.toDecimalPlaces(8).toString(),
        overallDrawdownPct: overallDrawdownPct.toDecimalPlaces(8).toString(),
      },
      orders: account.orders.map((order) => ({
        id: order.id,
        symbol: order.instrument.symbol,
        type: order.type,
        side: order.side,
        status: order.status,
        quantity: order.quantity.toString(),
        limitPrice: order.limitPrice?.toString() ?? null,
        stopPrice: order.stopPrice?.toString() ?? null,
        stopLoss: order.stopLoss?.toString() ?? null,
        takeProfit: order.takeProfit?.toString() ?? null,
      })),
      trades: account.trades.map((trade) => ({
        id: trade.id,
        symbol: trade.instrument.symbol,
        action: trade.action,
        side: trade.side,
        quantity: trade.quantity.toString(),
        realizedPnl: trade.realizedPnl.toString(),
        entryPrice: trade.entryPrice.toString(),
        exitPrice: trade.exitPrice?.toString() ?? null,
        fees: trade.fees.toString(),
        openedAt: trade.openedAt.toISOString(),
        closedAt: trade.closedAt?.toISOString() ?? null,
      })),
      watchlistInstrumentIds: watchlist.map((item) => item.instrumentId),
      chartLayout: chartLayout
        ? {
            symbol: chartLayout.symbol,
            timeframe: chartLayout.timeframe,
            engine: chartLayout.engine,
            chartType:
              typeof chartLayout.payload === "object" &&
              chartLayout.payload !== null &&
              !Array.isArray(chartLayout.payload) &&
              typeof chartLayout.payload.chartType === "string"
                ? chartLayout.payload.chartType
                : "Candles",
            theme:
              typeof chartLayout.payload === "object" &&
              chartLayout.payload !== null &&
              !Array.isArray(chartLayout.payload) &&
              chartLayout.payload.theme === "light"
                ? "light"
                : "dark",
          }
        : null,
      leaderboard: leaderboardAccounts
        .map((entry) => {
          const realizedPnl = entry.balance.minus(entry.initialBalance);
          const returnPct = entry.initialBalance.isZero()
            ? new Decimal(0)
            : realizedPnl.div(entry.initialBalance).mul(100);
          return {
            userId: entry.user.id,
            displayName: entry.user.displayName,
            returnPct: returnPct.toDecimalPlaces(4).toString(),
            realizedPnl: realizedPnl.toString(),
            challengeStatus: entry.challenges[0]?.status ?? null,
          };
        })
        .sort((first, second) =>
          new Decimal(second.returnPct).cmp(first.returnPct),
        )
        .slice(0, 20),
      serverTime: now.toISOString(),
    });
  } catch (error) {
    return errorResponse(error, context.requestId);
  }
}
