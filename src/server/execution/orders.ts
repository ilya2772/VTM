import "server-only";

import type { DecimalInput } from "@/server/execution/decimal";
import { positive } from "@/server/execution/decimal";
import type { OrderSide } from "@/server/execution/domain";

export type OrderType = "MARKET" | "LIMIT" | "STOP_LIMIT";

export function isLimitExecutable(input: {
  side: OrderSide;
  marketPrice: DecimalInput;
  limitPrice: DecimalInput;
}): boolean {
  const market = positive(input.marketPrice, "marketPrice");
  const limit = positive(input.limitPrice, "limitPrice");
  return input.side === "BUY" ? market.lte(limit) : market.gte(limit);
}

export function isStopTriggered(input: {
  side: OrderSide;
  marketPrice: DecimalInput;
  stopPrice: DecimalInput;
}): boolean {
  const market = positive(input.marketPrice, "marketPrice");
  const stop = positive(input.stopPrice, "stopPrice");
  return input.side === "BUY" ? market.gte(stop) : market.lte(stop);
}

export function evaluateOrder(
  input:
    | { type: "MARKET" }
    | {
        type: "LIMIT";
        side: OrderSide;
        marketPrice: DecimalInput;
        limitPrice: DecimalInput;
      }
    | {
        type: "STOP_LIMIT";
        side: OrderSide;
        marketPrice: DecimalInput;
        stopPrice: DecimalInput;
        limitPrice: DecimalInput;
        previouslyTriggered?: boolean;
      },
): { triggered: boolean; executable: boolean } {
  if (input.type === "MARKET") {
    return { triggered: true, executable: true };
  }
  if (input.type === "LIMIT") {
    return {
      triggered: true,
      executable: isLimitExecutable(input),
    };
  }

  const triggered =
    input.previouslyTriggered === true || isStopTriggered(input);
  return {
    triggered,
    executable: triggered && isLimitExecutable(input),
  };
}
