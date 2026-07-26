import "server-only";

import { positive, type PositionSide } from "@/server/execution";
import { ApiError } from "@/server/http/api-error";

export function validateProtectiveTargets(input: {
  side: PositionSide;
  referencePrice: string;
  stopLoss?: string | null;
  takeProfit?: string | null;
}): void {
  const reference = positive(input.referencePrice, "referencePrice");
  const stopLoss = input.stopLoss ? positive(input.stopLoss, "stopLoss") : null;
  const takeProfit = input.takeProfit
    ? positive(input.takeProfit, "takeProfit")
    : null;
  const stopLossValid =
    !stopLoss ||
    (input.side === "LONG" ? stopLoss.lt(reference) : stopLoss.gt(reference));
  const takeProfitValid =
    !takeProfit ||
    (input.side === "LONG"
      ? takeProfit.gt(reference)
      : takeProfit.lt(reference));
  if (!stopLossValid || !takeProfitValid)
    throw new ApiError(
      422,
      "TARGET_INVALID",
      input.side === "LONG"
        ? "Long requires stop loss below and take profit above current price."
        : "Short requires stop loss above and take profit below current price.",
    );
}
