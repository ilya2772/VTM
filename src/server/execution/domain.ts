import "server-only";

import {
  Decimal,
  type DecimalInput,
  nonNegative,
  positive,
  quantize,
  SCALE,
} from "@/server/execution/decimal";

export type PositionSide = "LONG" | "SHORT";
export type OrderSide = "BUY" | "SELL";
export type LiquidityRole = "MAKER" | "TAKER";
export type ExitTrigger = "STOP_LOSS" | "TAKE_PROFIT" | "LIQUIDATION";

const BPS = new Decimal(10_000);
const ONE = new Decimal(1);

function rateFromBps(value: DecimalInput, label: string): Decimal {
  return nonNegative(value, label).div(BPS);
}

export function calculateNotional(
  quantity: DecimalInput,
  price: DecimalInput,
): Decimal {
  return quantize(
    positive(quantity, "quantity").mul(positive(price, "price")),
    SCALE.money,
  );
}

export function calculatePnl(input: {
  side: PositionSide;
  quantity: DecimalInput;
  entryPrice: DecimalInput;
  exitPrice: DecimalInput;
}): Decimal {
  const quantity = positive(input.quantity, "quantity");
  const entryPrice = positive(input.entryPrice, "entryPrice");
  const exitPrice = positive(input.exitPrice, "exitPrice");
  const priceMove =
    input.side === "LONG"
      ? exitPrice.minus(entryPrice)
      : entryPrice.minus(exitPrice);

  return quantize(quantity.mul(priceMove), SCALE.money);
}

export function calculateFee(input: {
  quantity: DecimalInput;
  price: DecimalInput;
  feeBps: DecimalInput;
}): Decimal {
  const unroundedNotional = positive(input.quantity, "quantity").mul(
    positive(input.price, "price"),
  );
  return quantize(
    unroundedNotional.mul(rateFromBps(input.feeBps, "feeBps")),
    SCALE.money,
  );
}

export function calculateInitialMargin(input: {
  quantity: DecimalInput;
  price: DecimalInput;
  leverage: DecimalInput;
}): Decimal {
  const leverage = positive(input.leverage, "leverage");
  return quantize(
    positive(input.quantity, "quantity")
      .mul(positive(input.price, "price"))
      .div(leverage),
    SCALE.money,
  );
}

export function simulateExecutionPrice(input: {
  side: OrderSide;
  oraclePrice: DecimalInput;
  spreadBps: DecimalInput;
  slippageBps: DecimalInput;
}): Decimal {
  const oraclePrice = positive(input.oraclePrice, "oraclePrice");
  const adverseRate = rateFromBps(input.spreadBps, "spreadBps")
    .div(2)
    .plus(rateFromBps(input.slippageBps, "slippageBps"));
  const multiplier =
    input.side === "BUY" ? ONE.plus(adverseRate) : ONE.minus(adverseRate);

  if (!multiplier.isPositive()) {
    throw new Error("spreadBps and slippageBps produce a non-positive price");
  }

  return quantize(oraclePrice.mul(multiplier), SCALE.price);
}

export function calculateLiquidationPrice(input: {
  side: PositionSide;
  entryPrice: DecimalInput;
  leverage: DecimalInput;
  maintenanceMarginRate: DecimalInput;
}): Decimal {
  const entryPrice = positive(input.entryPrice, "entryPrice");
  const leverage = positive(input.leverage, "leverage");
  if (leverage.lte(ONE)) {
    throw new Error("leverage must be greater than one");
  }

  const maintenanceRate = nonNegative(
    input.maintenanceMarginRate,
    "maintenanceMarginRate",
  );
  if (maintenanceRate.gte(ONE)) {
    throw new Error("maintenanceMarginRate must be less than one");
  }

  const inverseLeverage = ONE.div(leverage);
  const result =
    input.side === "LONG"
      ? entryPrice
          .mul(ONE.minus(inverseLeverage))
          .div(ONE.minus(maintenanceRate))
      : entryPrice
          .mul(ONE.plus(inverseLeverage))
          .div(ONE.plus(maintenanceRate));

  return quantize(result, SCALE.price);
}

export function shouldTriggerExit(input: {
  side: PositionSide;
  trigger: ExitTrigger;
  markPrice: DecimalInput;
  triggerPrice: DecimalInput;
}): boolean {
  const mark = positive(input.markPrice, "markPrice");
  const trigger = positive(input.triggerPrice, "triggerPrice");

  if (input.trigger === "TAKE_PROFIT") {
    return input.side === "LONG" ? mark.gte(trigger) : mark.lte(trigger);
  }
  return input.side === "LONG" ? mark.lte(trigger) : mark.gte(trigger);
}

export function closePosition(input: {
  side: PositionSide;
  positionQuantity: DecimalInput;
  closeQuantity: DecimalInput;
  entryPrice: DecimalInput;
  exitPrice: DecimalInput;
  feeBps: DecimalInput;
}): {
  closedQuantity: Decimal;
  remainingQuantity: Decimal;
  grossPnl: Decimal;
  fee: Decimal;
  netPnl: Decimal;
  fullyClosed: boolean;
} {
  const positionQuantity = positive(input.positionQuantity, "positionQuantity");
  const closeQuantity = positive(input.closeQuantity, "closeQuantity");
  if (closeQuantity.gt(positionQuantity)) {
    throw new Error("closeQuantity cannot exceed positionQuantity");
  }

  const exitPrice = positive(input.exitPrice, "exitPrice");
  const grossPnl = calculatePnl({
    side: input.side,
    quantity: closeQuantity,
    entryPrice: input.entryPrice,
    exitPrice,
  });
  const fee = calculateFee({
    quantity: closeQuantity,
    price: exitPrice,
    feeBps: input.feeBps,
  });
  const remainingQuantity = quantize(
    positionQuantity.minus(closeQuantity),
    SCALE.quantity,
  );

  return {
    closedQuantity: quantize(closeQuantity, SCALE.quantity),
    remainingQuantity,
    grossPnl,
    fee,
    netPnl: quantize(grossPnl.minus(fee), SCALE.money),
    fullyClosed: remainingQuantity.isZero(),
  };
}
