import "server-only";

import { z } from "zod";

const decimalString = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/)
  .max(64);
const id = z.string().min(1).max(128);

export const placeOrderSchema = z
  .object({
    accountId: id,
    instrumentId: id,
    idempotencyKey: id,
    type: z.enum(["MARKET", "LIMIT", "STOP_LIMIT"]),
    side: z.enum(["LONG", "SHORT"]),
    quantity: decimalString,
    leverage: decimalString,
    limitPrice: decimalString.optional(),
    stopPrice: decimalString.optional(),
    stopLoss: decimalString.optional(),
    takeProfit: decimalString.optional(),
  })
  .superRefine((value, context) => {
    if (value.type !== "MARKET" && value.limitPrice === undefined)
      context.addIssue({
        code: "custom",
        path: ["limitPrice"],
        message: "Limit price is required.",
      });
    if (value.type === "STOP_LIMIT" && value.stopPrice === undefined)
      context.addIssue({
        code: "custom",
        path: ["stopPrice"],
        message: "Stop price is required.",
      });
  });

export const cancelOrderSchema = z.object({ accountId: id, orderId: id });
export const closePositionSchema = z.object({
  accountId: id,
  instrumentId: id,
  positionId: id,
  quantity: decimalString,
  idempotencyKey: id,
});
