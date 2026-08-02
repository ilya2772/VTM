import Decimal from "decimal.js";

export type RiskSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface RiskScoreInput {
  balance: string;
  equity: string;
  totalExposure: string;
  selectedAssetExposure: string;
  leverage: string;
  maxLeverage: string;
  orderNotional: string;
  potentialLoss: string | null;
  hasStopLoss: boolean;
  dailyDrawdownPct: string;
  maxDailyDrawdownPct: string;
  overallDrawdownPct: string;
  maxOverallDrawdownPct: string;
  correlatedPositions: number;
  blockingViolations: string[];
}

export interface RiskFactor {
  code: string;
  label: string;
  penalty: string;
  severity: RiskSeverity;
}

export interface RiskScoreResult {
  score: number;
  level: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  factors: RiskFactor[];
  blocked: boolean;
}

const value = (input: string) => new Decimal(input || 0);
const ratio = (amount: Decimal, limit: Decimal) =>
  limit.gt(0)
    ? Decimal.min(Decimal.max(amount.div(limit), 0), 1)
    : new Decimal(1);

/**
 * Transparent 100-point model. Penalty weights: exposure 22, leverage 14,
 * open/order risk 18, order size 10, missing SL 12, daily DD 10, overall DD 8,
 * single-asset concentration 4, correlated positions 2. Hard server challenge
 * violations always produce a zero score and block execution.
 */
export function calculateRiskScore(input: RiskScoreInput): RiskScoreResult {
  if (input.blockingViolations.length) {
    return {
      score: 0,
      level: "CRITICAL",
      blocked: true,
      factors: input.blockingViolations.slice(0, 5).map((label) => ({
        code: "RULE_VIOLATION",
        label,
        penalty: "100",
        severity: "CRITICAL",
      })),
    };
  }

  const balance = value(input.balance);
  const equity = value(input.equity);
  const exposurePenalty = ratio(value(input.totalExposure), balance).mul(22);
  const leveragePenalty = ratio(
    value(input.leverage),
    value(input.maxLeverage),
  ).mul(14);
  const potentialLoss = value(input.potentialLoss ?? "0").abs();
  const riskPenalty = input.hasStopLoss
    ? ratio(potentialLoss, equity.mul("0.05")).mul(18)
    : new Decimal(18);
  const sizePenalty = ratio(value(input.orderNotional), balance).mul(10);
  const stopPenalty = input.hasStopLoss ? new Decimal(0) : new Decimal(12);
  const dailyPenalty = ratio(
    value(input.dailyDrawdownPct),
    value(input.maxDailyDrawdownPct),
  ).mul(10);
  const overallPenalty = ratio(
    value(input.overallDrawdownPct),
    value(input.maxOverallDrawdownPct),
  ).mul(8);
  const concentrationPenalty = ratio(
    value(input.selectedAssetExposure),
    Decimal.max(value(input.totalExposure), 1),
  ).mul(4);
  const correlationPenalty = Decimal.min(input.correlatedPositions, 3)
    .div(3)
    .mul(2);

  const factorData = [
    ["EXPOSURE", "Total exposure relative to balance", exposurePenalty],
    ["LEVERAGE", "Requested leverage", leveragePenalty],
    [
      "TRADE_RISK",
      input.hasStopLoss ? "Potential loss to Stop Loss" : "No Stop Loss is set",
      riskPenalty.plus(stopPenalty),
    ],
    ["ORDER_SIZE", "New order size relative to balance", sizePenalty],
    ["DAILY_DRAWDOWN", "Daily drawdown usage", dailyPenalty],
    ["OVERALL_DRAWDOWN", "Overall drawdown usage", overallPenalty],
    ["CONCENTRATION", "Concentration in selected asset", concentrationPenalty],
    ["CORRELATION", "Correlated open positions", correlationPenalty],
  ] as const;
  const totalPenalty = factorData.reduce(
    (sum, factor) => sum.plus(factor[2]),
    new Decimal(0),
  );
  const score = Decimal.max(100 - totalPenalty.toNumber(), 0)
    .toDecimalPlaces(0)
    .toNumber();
  const level =
    score >= 80
      ? "LOW"
      : score >= 60
        ? "MODERATE"
        : score >= 40
          ? "HIGH"
          : "CRITICAL";
  const factors = [...factorData]
    .filter((factor) => factor[2].gt(0))
    .sort((first, second) => second[2].cmp(first[2]))
    .slice(0, 5)
    .map(([code, label, penalty]) => ({
      code,
      label,
      penalty: penalty.toDecimalPlaces(2).toString(),
      severity: penalty.gte(15)
        ? ("CRITICAL" as const)
        : penalty.gte(7)
          ? ("WARNING" as const)
          : ("INFO" as const),
    }));
  return { score, level, factors, blocked: score < 20 };
}
