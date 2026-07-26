import "server-only";

import { z } from "zod";

const decimalString = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/)
  .refine((value) => !/^0+(?:\.0+)?$/.test(value), "Value must be positive.")
  .max(64);
const id = z.string().min(1).max(128);

const orderTicketShape = {
  accountId: id,
  instrumentId: id,
  type: z.enum(["MARKET", "LIMIT", "STOP_LIMIT"]),
  side: z.enum(["LONG", "SHORT"]),
  size: decimalString,
  sizeUnit: z.enum(["USD", "ASSET"]),
  leverage: decimalString,
  limitPrice: decimalString.optional(),
  stopPrice: decimalString.optional(),
  stopLoss: decimalString.optional(),
  takeProfit: decimalString.optional(),
} as const;

function validateOrderFields(
  value: {
    type: "MARKET" | "LIMIT" | "STOP_LIMIT";
    limitPrice?: string;
    stopPrice?: string;
  },
  context: z.RefinementCtx,
) {
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
}

export const previewOrderSchema = z
  .object(orderTicketShape)
  .superRefine(validateOrderFields);

export const placeOrderSchema = z
  .object({ ...orderTicketShape, idempotencyKey: id })
  .superRefine(validateOrderFields);

export const cancelOrderSchema = z.object({ accountId: id, orderId: id });
export const closePositionSchema = z.object({
  accountId: id,
  instrumentId: id,
  positionId: id,
  quantity: decimalString,
  idempotencyKey: id,
});

export const updatePositionTargetsSchema = z
  .object({
    accountId: id,
    instrumentId: id,
    positionId: id,
    stopLoss: decimalString.nullable().optional(),
    takeProfit: decimalString.nullable().optional(),
  })
  .refine(
    (value) => value.stopLoss !== undefined || value.takeProfit !== undefined,
    "At least one target field is required.",
  );
