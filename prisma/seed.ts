import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$transaction(async (tx) => {
    const demoUser = await tx.user.upsert({
      where: { email: "demo@axiom.local" },
      update: {
        displayName: "Demo Trader",
        passwordHash:
          "scrypt$16384$8$1$AeWk9G_BPyWpWNV2edlLnA$Bs2CnQXYojDddTFhcci0RwIJcg4_VYBEqnU1cxZYRypBWRydcEuMzKM1IbggGAjZdPJE0-EEedJgHxKfDNxTGg",
      },
      create: {
        id: "demo-user",
        email: "demo@axiom.local",
        displayName: "Demo Trader",
        passwordHash:
          "scrypt$16384$8$1$AeWk9G_BPyWpWNV2edlLnA$Bs2CnQXYojDddTFhcci0RwIJcg4_VYBEqnU1cxZYRypBWRydcEuMzKM1IbggGAjZdPJE0-EEedJgHxKfDNxTGg",
      },
    });

    const account = await tx.tradingAccount.upsert({
      where: { id: "demo-account" },
      update: {
        userId: demoUser.id,
        currency: "USDT",
        initialBalance: "50000",
        balance: "50000",
        status: "ACTIVE",
      },
      create: {
        id: "demo-account",
        userId: demoUser.id,
        currency: "USDT",
        initialBalance: "50000",
        balance: "50000",
      },
    });

    const challenge = await tx.challenge.upsert({
      where: { id: "demo-challenge" },
      update: {
        accountId: account.id,
        status: "ACTIVE",
        peakEquity: "50000",
        dailyStartingEquity: "50000",
        tradingDays: 0,
      },
      create: {
        id: "demo-challenge",
        accountId: account.id,
        peakEquity: "50000",
        dailyStartingEquity: "50000",
      },
    });

    await tx.challengeRules.upsert({
      where: { challengeId: challenge.id },
      update: {
        initialBalance: "50000",
        profitTargetPct: "10",
        maxDailyLossPct: "5",
        maxOverallLossPct: "10",
        minTradingDays: 3,
        timezone: "UTC",
        closePositionsOnBreach: false,
        maxLeverage: "10",
        maxPositionNotional: "250000",
      },
      create: {
        id: "demo-challenge-rules",
        challengeId: challenge.id,
        initialBalance: "50000",
        profitTargetPct: "10",
        maxDailyLossPct: "5",
        maxOverallLossPct: "10",
        minTradingDays: 3,
        timezone: "UTC",
        maxLeverage: "10",
        maxPositionNotional: "250000",
      },
    });

    await tx.instrument.upsert({
      where: { symbol: "BTC/USD" },
      update: {
        displayName: "Bitcoin / US Dollar",
        baseAsset: "BTC",
        quoteAsset: "USD",
        source: "DEMO",
        pythPriceFeedId: null,
        priceExponent: null,
        isActive: true,
      },
      create: {
        id: "demo-instrument-btc-usd",
        symbol: "BTC/USD",
        displayName: "Bitcoin / US Dollar",
        baseAsset: "BTC",
        quoteAsset: "USD",
        source: "DEMO",
      },
    });

    await tx.instrument.upsert({
      where: { symbol: "ETH/USD" },
      update: {
        displayName: "Ether / US Dollar",
        baseAsset: "ETH",
        quoteAsset: "USD",
        source: "DEMO",
        pythPriceFeedId: null,
        priceExponent: null,
        isActive: true,
      },
      create: {
        id: "demo-instrument-eth-usd",
        symbol: "ETH/USD",
        displayName: "Ether / US Dollar",
        baseAsset: "ETH",
        quoteAsset: "USD",
        source: "DEMO",
      },
    });

    await tx.equitySnapshot.upsert({
      where: { id: "demo-equity-snapshot" },
      update: {
        accountId: account.id,
        balance: "50000",
        equity: "50000",
        realizedPnl: "0",
        unrealizedPnl: "0",
        peakEquity: "50000",
      },
      create: {
        id: "demo-equity-snapshot",
        accountId: account.id,
        balance: "50000",
        equity: "50000",
        realizedPnl: "0",
        unrealizedPnl: "0",
        peakEquity: "50000",
      },
    });
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
