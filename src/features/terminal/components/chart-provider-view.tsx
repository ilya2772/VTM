"use client";

import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type LogicalRange,
  type SeriesMarker,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

import { AxiomChartProvider } from "@/features/terminal/chart/chart-provider";
import {
  chartResolutionSeconds,
  type ChartBar,
  type ChartResolution,
} from "@/shared/chart";

export type ChartKind = "Candles" | "Bars" | "Line" | "Area" | "Heikin Ashi";

export interface TradeMarker {
  id: string;
  side: string;
  action: string;
  openedAt: string;
  closedAt: string | null;
}

interface ChartProviderViewProps {
  symbol: string;
  timeframe: ChartResolution;
  trades: readonly TradeMarker[];
  initialKind?: string;
  onKindChange?(kind: ChartKind): void;
}

const chartKinds: readonly ChartKind[] = [
  "Candles",
  "Bars",
  "Line",
  "Area",
  "Heikin Ashi",
];

function utcTime(seconds: number): UTCTimestamp {
  if (!Number.isSafeInteger(seconds)) throw new Error("Invalid chart time.");
  return seconds as UTCTimestamp;
}

function heikinAshi(bars: readonly ChartBar[]): ChartBar[] {
  let previousOpen: number | null = null;
  let previousClose: number | null = null;
  return bars.map((bar) => {
    const close = (bar.open + bar.high + bar.low + bar.close) / 4;
    const open =
      previousOpen === null || previousClose === null
        ? (bar.open + bar.close) / 2
        : (previousOpen + previousClose) / 2;
    const transformed = {
      time: bar.time,
      open,
      high: Math.max(bar.high, open, close),
      low: Math.min(bar.low, open, close),
      close,
    };
    previousOpen = open;
    previousClose = close;
    return transformed;
  });
}

function storedChartKind(): ChartKind {
  try {
    const stored = window.localStorage?.getItem("axiom.chart.kind");
    return chartKinds.find((kind) => kind === stored) ?? "Candles";
  } catch {
    return "Candles";
  }
}

function isChartKind(value: string): value is ChartKind {
  return chartKinds.some((kind) => kind === value);
}

function readSetting(key: string): string | null {
  try {
    return window.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeSetting(key: string, value: string): void {
  try {
    window.localStorage?.setItem(key, value);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

function chartColors(light: boolean) {
  return {
    background: light ? "#ffffff" : "#080d13",
    text: light ? "#5f6d7a" : "#8c98a7",
    grid: light ? "#e6ebef" : "#18212c",
  };
}

function applyTheme(chart: IChartApi, light: boolean) {
  const colors = chartColors(light);
  chart.applyOptions({
    layout: {
      background: { type: ColorType.Solid, color: colors.background },
      textColor: colors.text,
    },
    grid: {
      vertLines: { color: colors.grid },
      horzLines: { color: colors.grid },
    },
  });
}

function createPriceSeries(chart: IChartApi, kind: ChartKind) {
  if (kind === "Line")
    return chart.addSeries(LineSeries, {
      color: "#9b7bff",
      lineWidth: 2,
      priceLineVisible: true,
    });
  if (kind === "Area")
    return chart.addSeries(AreaSeries, {
      lineColor: "#9b7bff",
      topColor: "#9b7bff55",
      bottomColor: "#9b7bff05",
      lineWidth: 2,
    });
  if (kind === "Bars")
    return chart.addSeries(BarSeries, {
      upColor: "#32d49b",
      downColor: "#ff6875",
      thinBars: false,
    });
  return chart.addSeries(CandlestickSeries, {
    upColor: "#32d49b",
    downColor: "#ff6875",
    borderVisible: false,
    wickUpColor: "#32d49b",
    wickDownColor: "#ff6875",
  });
}

function setSeriesData(
  series: ISeriesApi<SeriesType>,
  kind: ChartKind,
  bars: readonly ChartBar[],
) {
  const displayed = kind === "Heikin Ashi" ? heikinAshi(bars) : bars;
  if (kind === "Line" || kind === "Area") {
    series.setData(
      displayed.map((bar) => ({ time: utcTime(bar.time), value: bar.close })),
    );
    return;
  }
  series.setData(displayed.map((bar) => ({ ...bar, time: utcTime(bar.time) })));
}

function updateSeries(
  series: ISeriesApi<SeriesType>,
  kind: ChartKind,
  bar: ChartBar,
) {
  if (kind === "Line" || kind === "Area") {
    series.update({ time: utcTime(bar.time), value: bar.close });
    return;
  }
  series.update({ ...bar, time: utcTime(bar.time) });
}

function tradeMarkers(
  trades: readonly TradeMarker[],
  interval: number,
): SeriesMarker<Time>[] {
  return trades
    .flatMap((trade) => {
      const opened =
        Math.floor(Date.parse(trade.openedAt) / 1000 / interval) * interval;
      const markers: SeriesMarker<Time>[] = [
        {
          time: utcTime(opened),
          position: trade.side === "LONG" ? "belowBar" : "aboveBar",
          color: trade.side === "LONG" ? "#32d49b" : "#ff6875",
          shape: trade.side === "LONG" ? "arrowUp" : "arrowDown",
          text: `${trade.action} ${trade.side}`,
        },
      ];
      if (trade.closedAt) {
        const closed =
          Math.floor(Date.parse(trade.closedAt) / 1000 / interval) * interval;
        markers.push({
          time: utcTime(closed),
          position: "inBar",
          color: "#f2bd61",
          shape: "circle",
          text: "CLOSE",
        });
      }
      return markers;
    })
    .sort((first, second) => Number(first.time) - Number(second.time));
}

function isLogicalRange(value: unknown): value is LogicalRange {
  return (
    typeof value === "object" &&
    value !== null &&
    "from" in value &&
    "to" in value &&
    typeof value.from === "number" &&
    typeof value.to === "number"
  );
}

export function ChartProviderView({
  symbol,
  timeframe,
  trades,
  initialKind,
  onKindChange,
}: ChartProviderViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const markersApi = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const [kind, setKind] = useState<ChartKind>("Candles");
  const [ohlc, setOhlc] = useState<ChartBar | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setKind(
          initialKind && isChartKind(initialKind)
            ? initialKind
            : storedChartKind(),
        ),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [initialKind]);
  useEffect(() => {
    writeSetting("axiom.chart.kind", kind);
  }, [kind]);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    setStatus("loading");
    const provider = new AxiomChartProvider();
    const chart = createChart(node, {
      width: node.clientWidth,
      height: node.clientHeight,
      autoSize: true,
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        timeVisible:
          timeframe !== "1D" && timeframe !== "1W" && timeframe !== "1M",
        secondsVisible: false,
        rightOffset: 4,
      },
    });
    applyTheme(chart, document.documentElement.dataset.theme === "light");
    const series = createPriceSeries(chart, kind);
    const markerApi = createSeriesMarkers(series, []);
    markersApi.current = markerApi;
    const rangeKey = `axiom.chart.range.${symbol}.${timeframe}`;
    const now = Math.floor(Date.now() / 1000);
    const interval = chartResolutionSeconds[timeframe];
    let lastBars: ChartBar[] = [];
    let disposed = false;

    provider.resolveSymbol(
      symbol,
      (resolved) =>
        provider.getBars(
          resolved,
          timeframe,
          { from: now - interval * 299, to: now, countBack: 300 },
          (bars) => {
            if (disposed) return;
            lastBars = [...bars];
            setSeriesData(series, kind, lastBars);
            setOhlc(lastBars.at(-1) ?? null);
            const storedRange = readSetting(rangeKey);
            if (storedRange) {
              try {
                const parsed: unknown = JSON.parse(storedRange);
                if (isLogicalRange(parsed))
                  chart.timeScale().setVisibleLogicalRange(parsed);
                else chart.timeScale().fitContent();
              } catch {
                chart.timeScale().fitContent();
              }
            } else chart.timeScale().fitContent();
            setStatus("ready");
            provider.subscribeBars(
              resolved,
              timeframe,
              (bar) => {
                if (disposed) return;
                const previous = lastBars.at(-1);
                if (previous?.time === bar.time)
                  lastBars[lastBars.length - 1] = bar;
                else lastBars.push(bar);
                const displayed =
                  kind === "Heikin Ashi"
                    ? (heikinAshi(lastBars).at(-1) ?? bar)
                    : bar;
                updateSeries(series, kind, displayed);
                setOhlc(displayed);
              },
              "terminal-chart",
              () => {
                if (!disposed) setStatus("error");
              },
            );
          },
          () => {
            if (!disposed) setStatus("error");
          },
        ),
      () => setStatus("error"),
    );

    const saveRange = (range: LogicalRange | null) => {
      if (range) writeSetting(rangeKey, JSON.stringify(range));
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(saveRange);
    const themeObserver = new MutationObserver(() =>
      applyTheme(chart, document.documentElement.dataset.theme === "light"),
    );
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      disposed = true;
      themeObserver.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(saveRange);
      markerApi.detach();
      if (markersApi.current === markerApi) markersApi.current = null;
      provider.destroy();
      chart.remove();
    };
  }, [kind, symbol, timeframe]);

  useEffect(() => {
    markersApi.current?.setMarkers(
      tradeMarkers(
        trades.filter((trade) => trade.action !== "FEE"),
        chartResolutionSeconds[timeframe],
      ),
    );
  }, [kind, timeframe, trades]);

  return (
    <div className="chart-provider-frame">
      <div className="chart-provider-toolbar">
        <label>
          Type
          <select
            aria-label="Chart type"
            value={kind}
            onChange={(event) => {
              if (isChartKind(event.target.value)) {
                setKind(event.target.value);
                onKindChange?.(event.target.value);
              }
            }}
          >
            {chartKinds.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <span className="chart-ohlc" aria-live="polite">
          {ohlc
            ? `O ${ohlc.open.toFixed(2)} H ${ohlc.high.toFixed(2)} L ${ohlc.low.toFixed(2)} C ${ohlc.close.toFixed(2)}`
            : "OHLC —"}
        </span>
        <span className={`chart-provider-status ${status}`}>{status}</span>
      </div>
      <div
        ref={host}
        className="chart-provider-canvas"
        aria-label={`Axiom simulated ${kind} chart for ${symbol}`}
      />
      {status === "error" && (
        <div className="chart-provider-error" role="alert">
          Chart data is unavailable. Execution remains disabled when prices are
          stale.
        </div>
      )}
      <div className="chart-disclosure">
        DEMO DATA · Lightweight Charts fallback · drawings and advanced
        indicators unavailable
      </div>
    </div>
  );
}
