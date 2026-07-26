import "server-only";

import {
  Decimal,
  type DecimalInput,
  decimal,
  nonNegative,
  positive,
  quantize,
  SCALE,
} from "@/server/execution/decimal";

export type ChallengeStatus = "ACTIVE" | "PASSED" | "FAILED";
export type RiskViolationType = "DAILY_LOSS" | "OVERALL_LOSS";

export interface RiskViolation {
  type: RiskViolationType;
  message: string;
  thresholdPct: Decimal;
  observedPct: Decimal;
  blocksTrading: true;
}

export interface ChallengeRulesInput {
  initialBalance: DecimalInput;
  profitTargetPct: DecimalInput;
  maxDailyLossPct: DecimalInput;
  maxOverallLossPct: DecimalInput;
  minTradingDays: number;
  timezone: string;
  closePositionsOnBreach: boolean;
}

export interface ChallengeEvaluationInput {
  status: ChallengeStatus;
  completedAt: Date | null;
  now: Date;
  balance: DecimalInput;
  unrealizedPnls: readonly DecimalInput[];
  previousPeakEquity: DecimalInput;
  dailyStartingEquity: DecimalInput;
  dailyTradingDate: string;
  qualifyingTradeTimes: readonly Date[];
  rules: ChallengeRulesInput;
}

export interface ChallengeEvaluation {
  status: ChallengeStatus;
  completedAt: Date | null;
  balance: Decimal;
  equity: Decimal;
  realizedPnl: Decimal;
  unrealizedPnl: Decimal;
  peakEquity: Decimal;
  dailyStartingEquity: Decimal;
  dailyDrawdownPct: Decimal;
  overallDrawdownPct: Decimal;
  profitPct: Decimal;
  tradingDays: number;
  tradingDate: string;
  dailyReset: boolean;
  violations: readonly RiskViolation[];
  blockNewOrders: boolean;
  closeOpenPositions: boolean;
  blockingReason: string | null;
}

const HUNDRED = new Decimal(100);

function percentage(value: DecimalInput, label: string): Decimal {
  const result = nonNegative(value, label);
  if (result.gt(HUNDRED)) {
    throw new Error(`${label} must not exceed 100`);
  }
  return result;
}

function percentageChange(
  baseline: Decimal,
  current: Decimal,
  direction: "GAIN" | "LOSS",
): Decimal {
  if (baseline.isZero()) {
    return new Decimal(0);
  }
  const difference =
    direction === "GAIN" ? current.minus(baseline) : baseline.minus(current);
  return quantize(
    Decimal.max(difference, 0).div(baseline).mul(HUNDRED),
    SCALE.rate,
  );
}

function assertValidDate(value: Date, label: string): void {
  if (Number.isNaN(value.getTime())) {
    throw new Error(`${label} must be a valid Date`);
  }
}

function validateMinTradingDays(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("minTradingDays must be a non-negative safe integer");
  }
}

export function tradingDateAt(timestamp: Date, timezone: string): string {
  assertValidDate(timestamp, "timestamp");
  if (timezone.trim() === "") {
    throw new Error("timezone must not be empty");
  }

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(timestamp);
  } catch {
    throw new Error(`timezone is not a valid IANA timezone: ${timezone}`);
  }

  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error("unable to determine trading date");
  }
  return `${year}-${month}-${day}`;
}

export function countTradingDays(
  qualifyingTradeTimes: readonly Date[],
  timezone: string,
): number {
  return new Set(
    qualifyingTradeTimes.map((timestamp) => tradingDateAt(timestamp, timezone)),
  ).size;
}

export function evaluateChallenge(
  input: ChallengeEvaluationInput,
): ChallengeEvaluation {
  assertValidDate(input.now, "now");
  if (input.completedAt !== null) {
    assertValidDate(input.completedAt, "completedAt");
  }
  validateMinTradingDays(input.rules.minTradingDays);

  const initialBalance = positive(input.rules.initialBalance, "initialBalance");
  const balance = nonNegative(input.balance, "balance");
  const previousPeakEquity = positive(
    input.previousPeakEquity,
    "previousPeakEquity",
  );
  const previousDailyStartingEquity = nonNegative(
    input.dailyStartingEquity,
    "dailyStartingEquity",
  );
  const profitTargetPct = percentage(
    input.rules.profitTargetPct,
    "profitTargetPct",
  );
  const maxDailyLossPct = percentage(
    input.rules.maxDailyLossPct,
    "maxDailyLossPct",
  );
  const maxOverallLossPct = percentage(
    input.rules.maxOverallLossPct,
    "maxOverallLossPct",
  );

  const unrealizedPnl = quantize(
    input.unrealizedPnls.reduce<Decimal>(
      (sum, value) => sum.plus(decimal(value, "unrealizedPnl")),
      new Decimal(0),
    ),
    SCALE.money,
  );
  const equity = quantize(balance.plus(unrealizedPnl), SCALE.money);
  if (equity.isNegative()) {
    throw new Error("equity must not be negative");
  }

  const tradingDate = tradingDateAt(input.now, input.rules.timezone);
  const dailyReset = tradingDate !== input.dailyTradingDate;
  const dailyStartingEquity = dailyReset ? equity : previousDailyStartingEquity;

  const peakEquity = quantize(
    Decimal.max(previousPeakEquity, equity),
    SCALE.money,
  );
  const realizedPnl = quantize(balance.minus(initialBalance), SCALE.money);
  const dailyDrawdownPct = percentageChange(
    dailyStartingEquity,
    equity,
    "LOSS",
  );
  const overallDrawdownPct = percentageChange(initialBalance, equity, "LOSS");
  const profitPct = percentageChange(initialBalance, equity, "GAIN");
  const tradingDays = countTradingDays(
    input.qualifyingTradeTimes,
    input.rules.timezone,
  );

  if (input.status !== "ACTIVE") {
    return {
      status: input.status,
      completedAt: input.completedAt,
      balance,
      equity,
      realizedPnl,
      unrealizedPnl,
      peakEquity,
      dailyStartingEquity,
      dailyDrawdownPct,
      overallDrawdownPct,
      profitPct,
      tradingDays,
      tradingDate,
      dailyReset,
      violations: [],
      blockNewOrders: true,
      closeOpenPositions: false,
      blockingReason: `Challenge is already ${input.status.toLowerCase()}.`,
    };
  }

  const violations: RiskViolation[] = [];
  if (dailyDrawdownPct.gte(maxDailyLossPct)) {
    violations.push({
      type: "DAILY_LOSS",
      message: `Daily loss limit reached (${dailyDrawdownPct.toFixed(SCALE.rate)}% of starting equity; limit ${maxDailyLossPct.toFixed(SCALE.rate)}%).`,
      thresholdPct: maxDailyLossPct,
      observedPct: dailyDrawdownPct,
      blocksTrading: true,
    });
  }
  if (overallDrawdownPct.gte(maxOverallLossPct)) {
    violations.push({
      type: "OVERALL_LOSS",
      message: `Overall loss limit reached (${overallDrawdownPct.toFixed(SCALE.rate)}% of initial balance; limit ${maxOverallLossPct.toFixed(SCALE.rate)}%).`,
      thresholdPct: maxOverallLossPct,
      observedPct: overallDrawdownPct,
      blocksTrading: true,
    });
  }

  const failed = violations.length > 0;
  const passed =
    !failed &&
    profitPct.gte(profitTargetPct) &&
    tradingDays >= input.rules.minTradingDays;
  const status: ChallengeStatus = failed
    ? "FAILED"
    : passed
      ? "PASSED"
      : "ACTIVE";
  const blockNewOrders = status !== "ACTIVE";
  const blockingReason = failed
    ? (violations[0]?.message ?? "Risk limit breached.")
    : passed
      ? "Profit target and minimum trading days completed."
      : null;

  return {
    status,
    completedAt: status === "ACTIVE" ? null : new Date(input.now),
    balance,
    equity,
    realizedPnl,
    unrealizedPnl,
    peakEquity,
    dailyStartingEquity,
    dailyDrawdownPct,
    overallDrawdownPct,
    profitPct,
    tradingDays,
    tradingDate,
    dailyReset,
    violations,
    blockNewOrders,
    closeOpenPositions: failed && input.rules.closePositionsOnBreach,
    blockingReason,
  };
}
