export const chartResolutions = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "12h",
  "1D",
  "1W",
  "1M",
] as const;

export type ChartResolution = (typeof chartResolutions)[number];

export const chartResolutionSeconds: Record<ChartResolution, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1_800,
  "1h": 3_600,
  "2h": 7_200,
  "4h": 14_400,
  "6h": 21_600,
  "12h": 43_200,
  "1D": 86_400,
  "1W": 604_800,
  "1M": 2_592_000,
};

export interface ChartBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartSymbol {
  name: string;
  ticker: string;
  description: string;
  type: "crypto";
  session: "24x7";
  timezone: "Etc/UTC";
  exchange: "AXIOM DEMO";
  minmov: 1;
  pricescale: number;
  hasIntraday: true;
  supportedResolutions: readonly ChartResolution[];
}

export interface ChartPeriod {
  from: number;
  to: number;
  countBack?: number;
}

export interface ChartDatafeedConfiguration {
  supportedResolutions: readonly ChartResolution[];
  supportsSearch: true;
  supportsTime: true;
}

export interface ChartProviderContract {
  onReady(callback: (configuration: ChartDatafeedConfiguration) => void): void;
  searchSymbols(
    query: string,
    callback: (symbols: readonly ChartSymbol[]) => void,
  ): void;
  resolveSymbol(
    symbol: string,
    onResolved: (symbol: ChartSymbol) => void,
    onError: (message: string) => void,
  ): void;
  getBars(
    symbol: ChartSymbol,
    resolution: ChartResolution,
    period: ChartPeriod,
    onHistory: (bars: readonly ChartBar[], noData: boolean) => void,
    onError: (message: string) => void,
  ): void;
  subscribeBars(
    symbol: ChartSymbol,
    resolution: ChartResolution,
    onRealtime: (bar: ChartBar) => void,
    subscriberUid: string,
    onResetCache: () => void,
  ): void;
  unsubscribeBars(subscriberUid: string): void;
}

export function isChartResolution(value: string): value is ChartResolution {
  return chartResolutions.some((resolution) => resolution === value);
}
