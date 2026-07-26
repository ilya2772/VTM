import "server-only";

import type { Prisma } from "@prisma/client";

import {
  calculateFee,
  calculateInitialMargin,
  calculateNotional,
  calculatePnl,
  closePosition,
  evaluateOrder,
  simulateExecutionPrice,
} from "@/server/execution";
import { assertExecutableTick, type MarketTick } from "@/server/market-data";
import { evaluateChallenge, tradingDateAt } from "@/server/risk";
import { prisma } from "@/server/db/client";
import { ApiError } from "@/server/http/api-error";

export interface PlaceOrderCommand {
  userId: string;
  accountId: string;
  instrumentId: string;
  idempotencyKey: string;
  type: "MARKET" | "LIMIT" | "STOP_LIMIT";
  side: "LONG" | "SHORT";
  quantity: string;
  leverage: string;
  limitPrice?: string;
  stopPrice?: string;
  stopLoss?: string;
  takeProfit?: string;
  requestId: string;
}

export interface ClosePositionCommand {
  userId: string;
  accountId: string;
  positionId: string;
  quantity: string;
  idempotencyKey: string;
  requestId: string;
}

const STALE_AFTER_MS = 5_000;

function asText(value: { toString(): string }): string {
  return value.toString();
}

async function persistRisk(
  tx: Prisma.TransactionClient,
  accountId: string,
  now: Date,
): Promise<void> {
  const account = await tx.tradingAccount.findUniqueOrThrow({
    where: { id: accountId },
    include: {
      challenges: {
        where: { status: "ACTIVE" },
        include: { rules: true },
        take: 1,
      },
      positions: { where: { status: "OPEN" } },
      trades: { select: { openedAt: true } },
      dailyRiskSnapshots: { orderBy: { capturedAt: "desc" }, take: 1 },
    },
  });
  const challenge = account.challenges[0];
  if (!challenge?.rules) return;
  const unrealizedPnls = account.positions.map((position) =>
    calculatePnl({
      side: position.side,
      quantity: position.quantity.toString(),
      entryPrice: position.entryPrice.toString(),
      exitPrice: position.markPrice.toString(),
    }).toString(),
  );
  const date = tradingDateAt(now, challenge.rules.timezone);
  const previousDaily = account.dailyRiskSnapshots[0];
  const evaluation = evaluateChallenge({
    status: challenge.status,
    completedAt: challenge.completedAt,
    now,
    balance: account.balance.toString(),
    unrealizedPnls,
    previousPeakEquity: challenge.peakEquity.toString(),
    dailyStartingEquity:
      previousDaily?.startingEquity.toString() ??
      challenge.dailyStartingEquity.toString(),
    dailyTradingDate: previousDaily
      ? tradingDateAt(previousDaily.tradingDate, challenge.rules.timezone)
      : date,
    qualifyingTradeTimes: account.trades.map(({ openedAt }) => openedAt),
    rules: {
      initialBalance: challenge.rules.initialBalance.toString(),
      profitTargetPct: challenge.rules.profitTargetPct.toString(),
      maxDailyLossPct: challenge.rules.maxDailyLossPct.toString(),
      maxOverallLossPct: challenge.rules.maxOverallLossPct.toString(),
      minTradingDays: challenge.rules.minTradingDays,
      timezone: challenge.rules.timezone,
      closePositionsOnBreach: challenge.rules.closePositionsOnBreach,
    },
  });
  await tx.challenge.update({
    where: { id: challenge.id },
    data: {
      status: evaluation.status,
      completedAt: evaluation.completedAt,
      peakEquity: asText(evaluation.peakEquity),
      dailyStartingEquity: asText(evaluation.dailyStartingEquity),
      tradingDays: evaluation.tradingDays,
    },
  });
  await tx.equitySnapshot.create({
    data: {
      accountId,
      balance: asText(evaluation.balance),
      equity: asText(evaluation.equity),
      realizedPnl: asText(evaluation.realizedPnl),
      unrealizedPnl: asText(evaluation.unrealizedPnl),
      peakEquity: asText(evaluation.peakEquity),
      capturedAt: now,
    },
  });
  await tx.dailyRiskSnapshot.upsert({
    where: {
      accountId_tradingDate: {
        accountId,
        tradingDate: new Date(`${date}T00:00:00.000Z`),
      },
    },
    update: {
      endingEquity: asText(evaluation.equity),
      dailyDrawdown: asText(evaluation.dailyDrawdownPct),
      overallDrawdown: asText(evaluation.overallDrawdownPct),
      peakEquity: asText(evaluation.peakEquity),
      capturedAt: now,
    },
    create: {
      accountId,
      tradingDate: new Date(`${date}T00:00:00.000Z`),
      timezone: challenge.rules.timezone,
      startingEquity: asText(evaluation.dailyStartingEquity),
      endingEquity: asText(evaluation.equity),
      dailyDrawdown: asText(evaluation.dailyDrawdownPct),
      overallDrawdown: asText(evaluation.overallDrawdownPct),
      peakEquity: asText(evaluation.peakEquity),
      capturedAt: now,
    },
  });
  for (const violation of evaluation.violations) {
    const existing = await tx.violation.findFirst({
      where: {
        challengeId: challenge.id,
        type: violation.type,
        resolvedAt: null,
      },
    });
    if (!existing) {
      await tx.violation.create({
        data: {
          accountId,
          challengeId: challenge.id,
          type: violation.type,
          message: violation.message,
          threshold: asText(violation.thresholdPct),
          observedValue: asText(violation.observedPct),
          blocksTrading: true,
          occurredAt: now,
        },
      });
    }
  }
  if (evaluation.blockNewOrders) {
    await tx.tradingAccount.update({
      where: { id: accountId },
      data: { status: "LOCKED" },
    });
  }
}

export async function placeOrder(
  command: PlaceOrderCommand,
  tick: MarketTick,
  now = new Date(),
) {
  assertExecutableTick(tick, now, STALE_AFTER_MS);
  return prisma.$transaction(async (tx) => {
    const replay = await tx.order.findUnique({
      where: {
        accountId_idempotencyKey: {
          accountId: command.accountId,
          idempotencyKey: command.idempotencyKey,
        },
      },
    });
    if (replay) return { order: replay, replayed: true };
    const account = await tx.tradingAccount.findFirst({
      where: { id: command.accountId, userId: command.userId },
      include: {
        challenges: {
          where: { status: "ACTIVE" },
          include: {
            rules: true,
            violations: { where: { resolvedAt: null, blocksTrading: true } },
          },
          take: 1,
        },
        positions: { where: { status: "OPEN" } },
      },
    });
    if (!account || account.status !== "ACTIVE")
      throw new ApiError(
        403,
        "ACCOUNT_LOCKED",
        "Trading account is not active.",
      );
    const challenge = account.challenges[0];
    if (!challenge?.rules || challenge.violations.length > 0)
      throw new ApiError(
        403,
        "RISK_BLOCKED",
        "Challenge risk rules block new orders.",
      );
    const instrument = await tx.instrument.findFirst({
      where: { id: command.instrumentId, isActive: true },
    });
    if (!instrument || instrument.symbol !== tick.symbol)
      throw new ApiError(
        400,
        "INSTRUMENT_INVALID",
        "Instrument is unavailable.",
      );
    if (
      account.positions.some(
        (position) =>
          position.instrumentId === instrument.id &&
          position.side === command.side,
      )
    ) {
      throw new ApiError(
        409,
        "POSITION_EXISTS",
        "Close the existing position before opening another in this direction.",
      );
    }
    const executionPrice = simulateExecutionPrice({
      side: command.side === "LONG" ? "BUY" : "SELL",
      oraclePrice: tick.price,
      spreadBps: "4",
      slippageBps: command.type === "MARKET" ? "2" : "0",
    });
    const decision = evaluateOrder(
      command.type === "MARKET"
        ? { type: "MARKET" }
        : command.type === "LIMIT"
          ? {
              type: "LIMIT",
              side: command.side === "LONG" ? "BUY" : "SELL",
              marketPrice: tick.price,
              limitPrice: command.limitPrice ?? "0",
            }
          : {
              type: "STOP_LIMIT",
              side: command.side === "LONG" ? "BUY" : "SELL",
              marketPrice: tick.price,
              limitPrice: command.limitPrice ?? "0",
              stopPrice: command.stopPrice ?? "0",
            },
    );
    const notional = calculateNotional(command.quantity, executionPrice);
    if (
      new (await import("decimal.js")).default(command.leverage).gt(
        challenge.rules.maxLeverage.toString(),
      )
    )
      throw new ApiError(
        422,
        "LEVERAGE_LIMIT",
        "Requested leverage exceeds the challenge limit.",
      );
    if (notional.gt(challenge.rules.maxPositionNotional.toString()))
      throw new ApiError(
        422,
        "POSITION_LIMIT",
        "Requested notional exceeds the challenge limit.",
      );
    const margin = calculateInitialMargin({
      quantity: command.quantity,
      price: executionPrice,
      leverage: command.leverage,
    });
    const fee = calculateFee({
      quantity: command.quantity,
      price: executionPrice,
      feeBps: command.type === "MARKET" ? "5" : "2",
    });
    if (margin.plus(fee).gt(account.balance.toString()))
      throw new ApiError(
        422,
        "INSUFFICIENT_BALANCE",
        "Available balance is insufficient.",
      );
    const order = await tx.order.create({
      data: {
        accountId: account.id,
        instrumentId: instrument.id,
        idempotencyKey: command.idempotencyKey,
        type: command.type,
        side: command.side,
        status: decision.executable ? "FILLED" : "OPEN",
        quantity: command.quantity,
        filledQuantity: decision.executable ? command.quantity : "0",
        notional: asText(notional),
        leverage: command.leverage,
        limitPrice: command.limitPrice,
        stopPrice: command.stopPrice,
        stopLoss: command.stopLoss,
        takeProfit: command.takeProfit,
        averageFillPrice: decision.executable ? asText(executionPrice) : null,
        totalFee: decision.executable ? asText(fee) : "0",
        filledAt: decision.executable ? now : null,
      },
    });
    if (decision.executable) {
      await tx.fill.create({
        data: {
          orderId: order.id,
          accountId: account.id,
          instrumentId: instrument.id,
          quantity: command.quantity,
          price: asText(executionPrice),
          fee: asText(fee),
          liquidityRole: command.type === "MARKET" ? "TAKER" : "MAKER",
          executedAt: now,
        },
      });
      const position = await tx.position.create({
        data: {
          accountId: account.id,
          instrumentId: instrument.id,
          side: command.side,
          quantity: command.quantity,
          entryPrice: asText(executionPrice),
          markPrice: asText(executionPrice),
          leverage: command.leverage,
          stopLoss: command.stopLoss,
          takeProfit: command.takeProfit,
          openedAt: now,
        },
      });
      await tx.trade.create({
        data: {
          accountId: account.id,
          instrumentId: instrument.id,
          positionId: position.id,
          action: "OPEN",
          side: command.side,
          quantity: command.quantity,
          entryPrice: asText(executionPrice),
          fees: asText(fee),
          openedAt: now,
        },
      });
      await tx.tradingAccount.update({
        where: { id: account.id },
        data: {
          balance: asText(
            new (await import("decimal.js")).default(
              account.balance.toString(),
            ).minus(fee),
          ),
        },
      });
      await persistRisk(tx, account.id, now);
    }
    await tx.auditLog.create({
      data: {
        userId: command.userId,
        accountId: account.id,
        action: "ORDER_CREATED",
        entityType: "Order",
        entityId: order.id,
        requestId: command.requestId,
        metadata: { source: tick.source, replayed: false },
      },
    });
    return { order, replayed: false };
  });
}

export async function cancelOrder(
  userId: string,
  accountId: string,
  orderId: string,
  requestId: string,
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, accountId, account: { userId } },
    });
    if (!order || !["OPEN", "PENDING"].includes(order.status))
      throw new ApiError(
        409,
        "ORDER_NOT_CANCELLABLE",
        "Order is not cancellable.",
      );
    const updated = await tx.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        userId,
        accountId,
        action: "ORDER_CANCELLED",
        entityType: "Order",
        entityId: order.id,
        requestId,
      },
    });
    return updated;
  });
}

export async function closeTradingPosition(
  command: ClosePositionCommand,
  tick: MarketTick,
  now = new Date(),
) {
  assertExecutableTick(tick, now, STALE_AFTER_MS);
  return prisma.$transaction(async (tx) => {
    const replay = await tx.order.findUnique({
      where: {
        accountId_idempotencyKey: {
          accountId: command.accountId,
          idempotencyKey: command.idempotencyKey,
        },
      },
    });
    if (replay) return { order: replay, replayed: true };
    const position = await tx.position.findFirst({
      where: {
        id: command.positionId,
        accountId: command.accountId,
        status: "OPEN",
        account: { userId: command.userId },
      },
      include: { account: true, instrument: true },
    });
    if (!position || position.instrument.symbol !== tick.symbol)
      throw new ApiError(
        404,
        "POSITION_NOT_FOUND",
        "Open position was not found.",
      );
    const executionPrice = simulateExecutionPrice({
      side: position.side === "LONG" ? "SELL" : "BUY",
      oraclePrice: tick.price,
      spreadBps: "4",
      slippageBps: "2",
    });
    const result = closePosition({
      side: position.side,
      positionQuantity: position.quantity.toString(),
      closeQuantity: command.quantity,
      entryPrice: position.entryPrice.toString(),
      exitPrice: executionPrice,
      feeBps: "5",
    });
    const nextBalance = new (await import("decimal.js")).default(
      position.account.balance.toString(),
    ).plus(result.netPnl);
    if (nextBalance.isNegative())
      throw new ApiError(
        422,
        "NEGATIVE_BALANCE",
        "Close would make account balance negative.",
      );
    const order = await tx.order.create({
      data: {
        accountId: command.accountId,
        instrumentId: position.instrumentId,
        idempotencyKey: command.idempotencyKey,
        type: "MARKET",
        side: position.side,
        status: "FILLED",
        quantity: command.quantity,
        filledQuantity: command.quantity,
        notional: asText(calculateNotional(command.quantity, executionPrice)),
        leverage: position.leverage,
        averageFillPrice: asText(executionPrice),
        totalFee: asText(result.fee),
        filledAt: now,
      },
    });
    await tx.fill.create({
      data: {
        orderId: order.id,
        accountId: command.accountId,
        instrumentId: position.instrumentId,
        quantity: command.quantity,
        price: asText(executionPrice),
        fee: asText(result.fee),
        liquidityRole: "TAKER",
        executedAt: now,
      },
    });
    await tx.trade.create({
      data: {
        accountId: command.accountId,
        instrumentId: position.instrumentId,
        positionId: position.id,
        action: "CLOSE",
        side: position.side,
        quantity: command.quantity,
        entryPrice: position.entryPrice,
        exitPrice: asText(executionPrice),
        realizedPnl: asText(result.grossPnl),
        fees: asText(result.fee),
        openedAt: position.openedAt,
        closedAt: now,
      },
    });
    await tx.position.update({
      where: { id: position.id },
      data: {
        quantity: asText(result.remainingQuantity),
        markPrice: asText(executionPrice),
        realizedPnl: { increment: asText(result.netPnl) },
        status: result.fullyClosed ? "CLOSED" : "OPEN",
        closedAt: result.fullyClosed ? now : null,
      },
    });
    await tx.tradingAccount.update({
      where: { id: command.accountId },
      data: { balance: asText(nextBalance) },
    });
    await persistRisk(tx, command.accountId, now);
    await tx.auditLog.create({
      data: {
        userId: command.userId,
        accountId: command.accountId,
        action: "POSITION_CLOSED",
        entityType: "Position",
        entityId: position.id,
        requestId: command.requestId,
      },
    });
    return { order, replayed: false };
  });
}
