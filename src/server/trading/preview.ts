import "server-only";

import {
  calculateFee,
  calculateInitialMargin,
  calculateLiquidationPrice,
  calculateNotional,
  calculatePnl,
  evaluateOrder,
  positive,
  quantize,
  SCALE,
  simulateExecutionPrice,
} from "@/server/execution";
import { ApiError } from "@/server/http/api-error";
import { assertExecutableTick, type MarketTick } from "@/server/market-data";
import { validateProtectiveTargets } from "@/server/trading/targets";

export interface OrderPreviewInput {
  type: "MARKET" | "LIMIT" | "STOP_LIMIT";
  side: "LONG" | "SHORT";
  size: string;
  sizeUnit: "USD" | "ASSET";
  leverage: string;
  limitPrice?: string;
  stopPrice?: string;
  stopLoss?: string;
  takeProfit?: string;
}

export interface OrderPreviewLimits {
  balance: string;
  maxLeverage: string;
  maxPositionNotional: string;
}

export interface OrderPreview {
  quantity: string;
  expectedExecutionPrice: string;
  notional: string;
  initialMargin: string;
  fee: string;
  liquidationPrice: string | null;
  potentialProfit: string | null;
  potentialLoss: string | null;
  riskReward: string | null;
  orderStatus: "FILLED" | "OPEN";
  priceSource: "DEMO" | "PYTH";
}

const STALE_AFTER_MS = 5_000;

export function calculateOrderPreview(
  input: OrderPreviewInput,
  tick: MarketTick,
  limits: OrderPreviewLimits,
  now = new Date(),
): OrderPreview {
  assertExecutableTick(tick, now, STALE_AFTER_MS);
  const leverage = positive(input.leverage, "leverage");
  if (leverage.gt(limits.maxLeverage))
    throw new ApiError(
      422,
      "LEVERAGE_LIMIT",
      "Requested leverage exceeds the challenge limit.",
    );
  const executionPrice = simulateExecutionPrice({
    side: input.side === "LONG" ? "BUY" : "SELL",
    oraclePrice: tick.price,
    spreadBps: "4",
    slippageBps: input.type === "MARKET" ? "2" : "0",
  });
  const size = positive(input.size, "size");
  const quantity = quantize(
    input.sizeUnit === "USD" ? size.div(executionPrice) : size,
    SCALE.quantity,
  );
  if (!quantity.isPositive())
    throw new ApiError(422, "SIZE_TOO_SMALL", "Order size is too small.");
  const decision = evaluateOrder(
    input.type === "MARKET"
      ? { type: "MARKET" }
      : input.type === "LIMIT"
        ? {
            type: "LIMIT",
            side: input.side === "LONG" ? "BUY" : "SELL",
            marketPrice: tick.price,
            limitPrice: input.limitPrice ?? "0",
          }
        : {
            type: "STOP_LIMIT",
            side: input.side === "LONG" ? "BUY" : "SELL",
            marketPrice: tick.price,
            limitPrice: input.limitPrice ?? "0",
            stopPrice: input.stopPrice ?? "0",
          },
  );
  const notional = calculateNotional(quantity, executionPrice);
  if (notional.gt(limits.maxPositionNotional))
    throw new ApiError(
      422,
      "POSITION_LIMIT",
      "Requested notional exceeds the challenge limit.",
    );
  const initialMargin = calculateInitialMargin({
    quantity,
    price: executionPrice,
    leverage,
  });
  const fee = calculateFee({
    quantity,
    price: executionPrice,
    feeBps: input.type === "MARKET" ? "5" : "2",
  });
  if (initialMargin.plus(fee).gt(limits.balance))
    throw new ApiError(
      422,
      "INSUFFICIENT_BALANCE",
      "Available balance is insufficient.",
    );
  validateProtectiveTargets({
    side: input.side,
    referencePrice: executionPrice.toString(),
    stopLoss: input.stopLoss,
    takeProfit: input.takeProfit,
  });

  const potentialProfit = input.takeProfit
    ? calculatePnl({
        side: input.side,
        quantity,
        entryPrice: executionPrice,
        exitPrice: input.takeProfit,
      })
    : null;
  const potentialLoss = input.stopLoss
    ? calculatePnl({
        side: input.side,
        quantity,
        entryPrice: executionPrice,
        exitPrice: input.stopLoss,
      })
    : null;
  const riskReward =
    potentialProfit && potentialLoss && !potentialLoss.isZero()
      ? potentialProfit.abs().div(potentialLoss.abs()).toDecimalPlaces(4)
      : null;
  const liquidationPrice = leverage.gt(1)
    ? calculateLiquidationPrice({
        side: input.side,
        entryPrice: executionPrice,
        leverage,
        maintenanceMarginRate: "0.005",
      })
    : null;

  return {
    quantity: quantity.toString(),
    expectedExecutionPrice: executionPrice.toString(),
    notional: notional.toString(),
    initialMargin: initialMargin.toString(),
    fee: fee.toString(),
    liquidationPrice: liquidationPrice?.toString() ?? null,
    potentialProfit: potentialProfit?.toString() ?? null,
    potentialLoss: potentialLoss?.toString() ?? null,
    riskReward: riskReward?.toString() ?? null,
    orderStatus: decision.executable ? "FILLED" : "OPEN",
    priceSource: tick.source,
  };
}
