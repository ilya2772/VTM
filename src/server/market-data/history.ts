import "server-only";

import { Decimal } from "@/server/execution";
import { demoTick } from "@/server/market-data/core";
import {
  chartResolutionSeconds,
  type ChartBar,
  type ChartResolution,
} from "@/shared/chart";

const MAX_HISTORY_BARS = 500;

function toChartNumber(value: Decimal): number {
  return Number(value.toFixed(8));
}

export function demoHistory(
  symbol: string,
  resolution: ChartResolution,
  from: number,
  to: number,
  countBack = 300,
): ChartBar[] {
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from > to)
    throw new Error("Invalid chart period.");
  const interval = chartResolutionSeconds[resolution];
  const requested = Math.min(
    Math.max(Math.trunc(countBack), 1),
    MAX_HISTORY_BARS,
  );
  const lastBucket = Math.floor(to / interval) * interval;
  const firstRequested = lastBucket - (requested - 1) * interval;
  const firstBucket = Math.max(
    Math.floor(from / interval) * interval,
    firstRequested,
  );
  const bars: ChartBar[] = [];

  for (let bucket = firstBucket; bucket <= lastBucket; bucket += interval) {
    const samples = [0, 1, 2, 3].map(
      (sample) =>
        demoTick(symbol, bucket + sample, new Date((bucket + sample) * 1000))
          .price,
    );
    const open = samples[0];
    const close = samples[3];
    if (!open || !close) continue;
    bars.push({
      time: bucket,
      open: toChartNumber(open),
      high: toChartNumber(Decimal.max(...samples)),
      low: toChartNumber(Decimal.min(...samples)),
      close: toChartNumber(close),
    });
  }
  return bars;
}
