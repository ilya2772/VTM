-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'LOCKED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('ACTIVE', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "MarketDataSource" AS ENUM ('PYTH', 'DEMO');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('MARKET', 'LIMIT', 'STOP_LIMIT');

-- CreateEnum
CREATE TYPE "OrderSide" AS ENUM ('LONG', 'SHORT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('OPEN', 'CLOSED', 'LIQUIDATED');

-- CreateEnum
CREATE TYPE "LiquidityRole" AS ENUM ('MAKER', 'TAKER');

-- CreateEnum
CREATE TYPE "TradeAction" AS ENUM ('OPEN', 'CLOSE');

-- CreateEnum
CREATE TYPE "ViolationType" AS ENUM ('DAILY_LOSS', 'OVERALL_LOSS', 'PROFIT_TARGET_INVALIDATED', 'POSITION_LIMIT', 'LEVERAGE_LIMIT', 'STALE_PRICE', 'NEGATIVE_BALANCE', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" VARCHAR(12) NOT NULL DEFAULT 'USDT',
    "initialBalance" DECIMAL(30,12) NOT NULL,
    "balance" DECIMAL(30,12) NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TradingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "peakEquity" DECIMAL(30,12) NOT NULL,
    "dailyStartingEquity" DECIMAL(30,12) NOT NULL,
    "tradingDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeRules" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "initialBalance" DECIMAL(30,12) NOT NULL,
    "profitTargetPct" DECIMAL(12,8) NOT NULL,
    "maxDailyLossPct" DECIMAL(12,8) NOT NULL,
    "maxOverallLossPct" DECIMAL(12,8) NOT NULL,
    "minTradingDays" INTEGER NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "closePositionsOnBreach" BOOLEAN NOT NULL DEFAULT false,
    "maxLeverage" DECIMAL(12,4) NOT NULL,
    "maxPositionNotional" DECIMAL(30,12) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChallengeRules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL,
    "symbol" VARCHAR(32) NOT NULL,
    "displayName" VARCHAR(128) NOT NULL,
    "baseAsset" VARCHAR(16) NOT NULL,
    "quoteAsset" VARCHAR(16) NOT NULL,
    "source" "MarketDataSource" NOT NULL DEFAULT 'DEMO',
    "pythPriceFeedId" VARCHAR(128),
    "priceExponent" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "clientOrderId" VARCHAR(128),
    "type" "OrderType" NOT NULL,
    "side" "OrderSide" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "quantity" DECIMAL(30,12) NOT NULL,
    "filledQuantity" DECIMAL(30,12) NOT NULL DEFAULT 0,
    "notional" DECIMAL(30,12) NOT NULL,
    "leverage" DECIMAL(12,4) NOT NULL,
    "limitPrice" DECIMAL(30,12),
    "stopPrice" DECIMAL(30,12),
    "stopLoss" DECIMAL(30,12),
    "takeProfit" DECIMAL(30,12),
    "averageFillPrice" DECIMAL(30,12),
    "totalFee" DECIMAL(30,12) NOT NULL DEFAULT 0,
    "rejectReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "filledAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fill" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "quantity" DECIMAL(30,12) NOT NULL,
    "price" DECIMAL(30,12) NOT NULL,
    "fee" DECIMAL(30,12) NOT NULL,
    "liquidityRole" "LiquidityRole" NOT NULL,
    "executedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "side" "OrderSide" NOT NULL,
    "status" "PositionStatus" NOT NULL DEFAULT 'OPEN',
    "quantity" DECIMAL(30,12) NOT NULL,
    "entryPrice" DECIMAL(30,12) NOT NULL,
    "markPrice" DECIMAL(30,12) NOT NULL,
    "leverage" DECIMAL(12,4) NOT NULL,
    "liquidationPrice" DECIMAL(30,12),
    "stopLoss" DECIMAL(30,12),
    "takeProfit" DECIMAL(30,12),
    "realizedPnl" DECIMAL(30,12) NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "positionId" TEXT,
    "action" "TradeAction" NOT NULL,
    "side" "OrderSide" NOT NULL,
    "quantity" DECIMAL(30,12) NOT NULL,
    "entryPrice" DECIMAL(30,12) NOT NULL,
    "exitPrice" DECIMAL(30,12),
    "realizedPnl" DECIMAL(30,12) NOT NULL DEFAULT 0,
    "fees" DECIMAL(30,12) NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquitySnapshot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "balance" DECIMAL(30,12) NOT NULL,
    "equity" DECIMAL(30,12) NOT NULL,
    "realizedPnl" DECIMAL(30,12) NOT NULL,
    "unrealizedPnl" DECIMAL(30,12) NOT NULL,
    "peakEquity" DECIMAL(30,12) NOT NULL,
    "capturedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyRiskSnapshot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tradingDate" DATE NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "startingEquity" DECIMAL(30,12) NOT NULL,
    "endingEquity" DECIMAL(30,12),
    "dailyDrawdown" DECIMAL(12,8) NOT NULL,
    "overallDrawdown" DECIMAL(12,8) NOT NULL,
    "peakEquity" DECIMAL(30,12) NOT NULL,
    "capturedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyRiskSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Violation" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "type" "ViolationType" NOT NULL,
    "message" TEXT NOT NULL,
    "threshold" DECIMAL(30,12),
    "observedValue" DECIMAL(30,12),
    "blocksTrading" BOOLEAN NOT NULL DEFAULT true,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Violation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChartLayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "symbol" VARCHAR(32) NOT NULL,
    "timeframe" VARCHAR(12) NOT NULL,
    "engine" VARCHAR(32) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChartLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "accountId" TEXT,
    "action" VARCHAR(128) NOT NULL,
    "entityType" VARCHAR(64) NOT NULL,
    "entityId" VARCHAR(128),
    "requestId" VARCHAR(128),
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "TradingAccount_userId_status_idx" ON "TradingAccount"("userId", "status");

-- CreateIndex
CREATE INDEX "Challenge_accountId_status_idx" ON "Challenge"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeRules_challengeId_key" ON "ChallengeRules"("challengeId");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_symbol_key" ON "Instrument"("symbol");

-- CreateIndex
CREATE INDEX "Instrument_isActive_symbol_idx" ON "Instrument"("isActive", "symbol");

-- CreateIndex
CREATE INDEX "Order_accountId_status_createdAt_idx" ON "Order"("accountId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_instrumentId_status_type_idx" ON "Order"("instrumentId", "status", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Order_accountId_idempotencyKey_key" ON "Order"("accountId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Fill_accountId_executedAt_idx" ON "Fill"("accountId", "executedAt");

-- CreateIndex
CREATE INDEX "Fill_orderId_executedAt_idx" ON "Fill"("orderId", "executedAt");

-- CreateIndex
CREATE INDEX "Position_accountId_status_idx" ON "Position"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Position_accountId_instrumentId_side_key" ON "Position"("accountId", "instrumentId", "side");

-- CreateIndex
CREATE INDEX "Trade_accountId_closedAt_idx" ON "Trade"("accountId", "closedAt");

-- CreateIndex
CREATE INDEX "Trade_instrumentId_openedAt_idx" ON "Trade"("instrumentId", "openedAt");

-- CreateIndex
CREATE INDEX "EquitySnapshot_accountId_capturedAt_idx" ON "EquitySnapshot"("accountId", "capturedAt");

-- CreateIndex
CREATE INDEX "DailyRiskSnapshot_accountId_capturedAt_idx" ON "DailyRiskSnapshot"("accountId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRiskSnapshot_accountId_tradingDate_key" ON "DailyRiskSnapshot"("accountId", "tradingDate");

-- CreateIndex
CREATE INDEX "Violation_accountId_occurredAt_idx" ON "Violation"("accountId", "occurredAt");

-- CreateIndex
CREATE INDEX "Violation_challengeId_type_occurredAt_idx" ON "Violation"("challengeId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "Watchlist_userId_createdAt_idx" ON "Watchlist"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_userId_instrumentId_key" ON "Watchlist"("userId", "instrumentId");

-- CreateIndex
CREATE INDEX "ChartLayout_userId_updatedAt_idx" ON "ChartLayout"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChartLayout_userId_name_key" ON "ChartLayout"("userId", "name");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_accountId_createdAt_idx" ON "AuditLog"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "TradingAccount" ADD CONSTRAINT "TradingAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeRules" ADD CONSTRAINT "ChallengeRules_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquitySnapshot" ADD CONSTRAINT "EquitySnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRiskSnapshot" ADD CONSTRAINT "DailyRiskSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Violation" ADD CONSTRAINT "Violation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Violation" ADD CONSTRAINT "Violation_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartLayout" ADD CONSTRAINT "ChartLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
