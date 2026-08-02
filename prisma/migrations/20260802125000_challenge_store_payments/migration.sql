ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'PENDING_PAYMENT';
ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'READY';
ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

CREATE TABLE "ChallengeProduct" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(96) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "description" TEXT NOT NULL,
    "accountSize" DECIMAL(30,12) NOT NULL,
    "price" DECIMAL(30,12) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "profitTargetPct" DECIMAL(12,8) NOT NULL,
    "maxDailyLossPct" DECIMAL(12,8) NOT NULL,
    "maxOverallLossPct" DECIMAL(12,8) NOT NULL,
    "minTradingDays" INTEGER NOT NULL,
    "maxLeverage" DECIMAL(12,4) NOT NULL,
    "maxPositionNotional" DECIMAL(30,12) NOT NULL,
    "stages" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ChallengeProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "challengeId" TEXT,
    "provider" VARCHAR(32) NOT NULL,
    "providerSessionId" VARCHAR(255) NOT NULL,
    "providerPaymentId" VARCHAR(255),
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(30,12) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "paidAt" TIMESTAMPTZ(3),
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "User" ADD COLUMN "activeAccountId" TEXT;
ALTER TABLE "Challenge" ADD COLUMN "productId" TEXT;
ALTER TABLE "Challenge" ADD COLUMN "purchasedAt" TIMESTAMPTZ(3);
ALTER TABLE "Challenge" ADD COLUMN "expiresAt" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX "ChallengeProduct_slug_key" ON "ChallengeProduct"("slug");
CREATE INDEX "ChallengeProduct_isActive_accountSize_price_stages_idx" ON "ChallengeProduct"("isActive", "accountSize", "price", "stages");
CREATE UNIQUE INDEX "Payment_challengeId_key" ON "Payment"("challengeId");
CREATE UNIQUE INDEX "Payment_providerSessionId_key" ON "Payment"("providerSessionId");
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");
CREATE INDEX "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");
CREATE UNIQUE INDEX "User_activeAccountId_key" ON "User"("activeAccountId");
CREATE INDEX "Challenge_productId_status_idx" ON "Challenge"("productId", "status");

ALTER TABLE "User" ADD CONSTRAINT "User_activeAccountId_fkey" FOREIGN KEY ("activeAccountId") REFERENCES "TradingAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ChallengeProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ChallengeProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
