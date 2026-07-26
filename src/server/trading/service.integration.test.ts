// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/server/db/client";
import { demoTick } from "@/server/market-data";
import { closeTradingPosition, placeOrder } from "@/server/trading/service";

const run = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const suffix = process.pid.toString();
const userId = `execution-test-user-${suffix}`;
const accountId = `execution-test-account-${suffix}`;
const challengeId = `execution-test-challenge-${suffix}`;
const instrumentId = "demo-instrument-btc-usd";
const now = new Date("2026-07-26T12:00:00.000Z");

run("transactional execution integration", () => {
  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@axiom.local`,
        displayName: "Execution Test",
        accounts: {
          create: {
            id: accountId,
            initialBalance: "50000",
            balance: "50000",
            challenges: {
              create: {
                id: challengeId,
                peakEquity: "50000",
                dailyStartingEquity: "50000",
                rules: {
                  create: {
                    initialBalance: "50000",
                    profitTargetPct: "10",
                    maxDailyLossPct: "5",
                    maxOverallLossPct: "10",
                    minTradingDays: 3,
                    timezone: "UTC",
                    maxLeverage: "10",
                    maxPositionNotional: "250000",
                  },
                },
              },
            },
          },
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("opens, replays idempotently and partially/full closes atomically", async () => {
    const tick = demoTick("BTC/USD", 10, now);
    const command = {
      userId,
      accountId,
      instrumentId,
      idempotencyKey: `open-${suffix}`,
      type: "MARKET" as const,
      side: "LONG" as const,
      quantity: "0.1",
      leverage: "5",
      requestId: "integration",
    };
    const opened = await placeOrder(command, tick, now);
    const replay = await placeOrder(command, tick, now);
    expect(opened.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(
      await prisma.order.count({
        where: { accountId, idempotencyKey: command.idempotencyKey },
      }),
    ).toBe(1);
    const position = await prisma.position.findFirstOrThrow({
      where: { accountId, status: "OPEN" },
    });
    await closeTradingPosition(
      {
        userId,
        accountId,
        positionId: position.id,
        quantity: "0.04",
        idempotencyKey: `partial-${suffix}`,
        requestId: "integration",
      },
      demoTick("BTC/USD", 12, new Date(now.getTime() + 1000)),
      new Date(now.getTime() + 1000),
    );
    const partial = await prisma.position.findUniqueOrThrow({
      where: { id: position.id },
    });
    expect(partial.quantity.toString()).toBe("0.06");
    await closeTradingPosition(
      {
        userId,
        accountId,
        positionId: position.id,
        quantity: "0.06",
        idempotencyKey: `full-${suffix}`,
        requestId: "integration",
      },
      demoTick("BTC/USD", 14, new Date(now.getTime() + 2000)),
      new Date(now.getTime() + 2000),
    );
    expect(
      (await prisma.position.findUniqueOrThrow({ where: { id: position.id } }))
        .status,
    ).toBe("CLOSED");
    expect(await prisma.fill.count({ where: { accountId } })).toBe(3);
    expect(await prisma.trade.count({ where: { accountId } })).toBe(3);
  });

  it("rolls back a rejected order without partial records", async () => {
    const key = `invalid-${suffix}`;
    await expect(
      placeOrder(
        {
          userId,
          accountId,
          instrumentId,
          idempotencyKey: key,
          type: "MARKET",
          side: "SHORT",
          quantity: "1",
          leverage: "100",
          requestId: "integration",
        },
        demoTick("BTC/USD", 10, now),
        now,
      ),
    ).rejects.toThrow("leverage");
    expect(
      await prisma.order.count({ where: { accountId, idempotencyKey: key } }),
    ).toBe(0);
  });
});
