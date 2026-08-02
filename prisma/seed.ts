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

    const products = [
      {
        id: "challenge-product-starter-10k",
        slug: "starter-10k",
        name: "Starter 10K",
        description: "A focused one-stage evaluation for disciplined traders.",
        accountSize: "10000",
        price: "79",
        profitTargetPct: "8",
        maxDailyLossPct: "5",
        maxOverallLossPct: "10",
        minTradingDays: 3,
        maxLeverage: "10",
        maxPositionNotional: "50000",
        stages: 1,
      },
      {
        id: "challenge-product-pro-50k",
        slug: "pro-50k",
        name: "Pro 50K",
        description: "A two-stage challenge with balanced targets and limits.",
        accountSize: "50000",
        price: "249",
        profitTargetPct: "10",
        maxDailyLossPct: "5",
        maxOverallLossPct: "10",
        minTradingDays: 3,
        maxLeverage: "10",
        maxPositionNotional: "250000",
        stages: 2,
      },
      {
        id: "challenge-product-elite-100k",
        slug: "elite-100k",
        name: "Elite 100K",
        description:
          "A larger two-stage evaluation with the same transparent risk rules.",
        accountSize: "100000",
        price: "449",
        profitTargetPct: "10",
        maxDailyLossPct: "4",
        maxOverallLossPct: "8",
        minTradingDays: 5,
        maxLeverage: "10",
        maxPositionNotional: "500000",
        stages: 2,
      },
    ] as const;
    for (const product of products) {
      await tx.challengeProduct.upsert({
        where: { slug: product.slug },
        update: { ...product, currency: "USD", isActive: true },
        create: { ...product, currency: "USD" },
      });
    }

    const challenge = await tx.challenge.upsert({
      where: { id: "demo-challenge" },
      update: {
        accountId: account.id,
        productId: "challenge-product-pro-50k",
        status: "ACTIVE",
        peakEquity: "50000",
        dailyStartingEquity: "50000",
        tradingDays: 0,
      },
      create: {
        id: "demo-challenge",
        accountId: account.id,
        productId: "challenge-product-pro-50k",
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

    await tx.user.update({
      where: { id: demoUser.id },
      data: { activeAccountId: account.id },
    });

    await tx.instrument.upsert({
      where: { symbol: "BTC/USD" },
      update: {
        displayName: "Bitcoin / US Dollar",
        baseAsset: "BTC",
        quoteAsset: "USD",
        source: "PYTH",
        pythPriceFeedId: "1",
        priceExponent: -8,
        isActive: true,
      },
      create: {
        id: "demo-instrument-btc-usd",
        symbol: "BTC/USD",
        displayName: "Bitcoin / US Dollar",
        baseAsset: "BTC",
        quoteAsset: "USD",
        source: "PYTH",
        pythPriceFeedId: "1",
        priceExponent: -8,
      },
    });

    await tx.instrument.upsert({
      where: { symbol: "ETH/USD" },
      update: {
        displayName: "Ether / US Dollar",
        baseAsset: "ETH",
        quoteAsset: "USD",
        source: "PYTH",
        pythPriceFeedId: "2",
        priceExponent: -8,
        isActive: true,
      },
      create: {
        id: "demo-instrument-eth-usd",
        symbol: "ETH/USD",
        displayName: "Ether / US Dollar",
        baseAsset: "ETH",
        quoteAsset: "USD",
        source: "PYTH",
        pythPriceFeedId: "2",
        priceExponent: -8,
      },
    });

    await tx.instrument.upsert({
      where: { symbol: "SOL/USD" },
      update: {
        displayName: "Solana / US Dollar",
        baseAsset: "SOL",
        quoteAsset: "USD",
        source: "PYTH",
        pythPriceFeedId: "6",
        priceExponent: -8,
        isActive: true,
      },
      create: {
        id: "demo-instrument-sol-usd",
        symbol: "SOL/USD",
        displayName: "Solana / US Dollar",
        baseAsset: "SOL",
        quoteAsset: "USD",
        source: "PYTH",
        pythPriceFeedId: "6",
        priceExponent: -8,
      },
    });

    await tx.instrument.upsert({
      where: { symbol: "XRP/USD" },
      update: {
        displayName: "XRP / US Dollar",
        baseAsset: "XRP",
        quoteAsset: "USD",
        source: "PYTH",
        pythPriceFeedId: "14",
        priceExponent: -8,
        isActive: true,
      },
      create: {
        id: "demo-instrument-xrp-usd",
        symbol: "XRP/USD",
        displayName: "XRP / US Dollar",
        baseAsset: "XRP",
        quoteAsset: "USD",
        source: "PYTH",
        pythPriceFeedId: "14",
        priceExponent: -8,
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
