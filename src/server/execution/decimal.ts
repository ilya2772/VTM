import "server-only";

import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type DecimalInput = string | Decimal;

export const SCALE = {
  money: 8,
  price: 8,
  quantity: 12,
  rate: 8,
} as const;

export function decimal(value: DecimalInput, label = "value"): Decimal {
  if (typeof value === "string" && value.trim() !== value) {
    throw new Error(`${label} must not contain surrounding whitespace`);
  }

  const result = new Decimal(value);
  if (!result.isFinite()) {
    throw new Error(`${label} must be finite`);
  }

  return result;
}

export function positive(value: DecimalInput, label: string): Decimal {
  const result = decimal(value, label);
  if (!result.isPositive()) {
    throw new Error(`${label} must be greater than zero`);
  }
  return result;
}

export function nonNegative(value: DecimalInput, label: string): Decimal {
  const result = decimal(value, label);
  if (result.isNegative()) {
    throw new Error(`${label} must be zero or greater`);
  }
  return result;
}

export function quantize(value: Decimal, scale: number): Decimal {
  return value.toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
}

export { Decimal };
