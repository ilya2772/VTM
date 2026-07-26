"use client";

import { useEffect, useRef } from "react";

const symbolMap: Record<string, string> = {
  "BTC/USD": "BINANCE:BTCUSDT",
  "ETH/USD": "BINANCE:ETHUSDT",
};

const intervalMap: Record<string, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "2h": "120",
  "4h": "240",
  "6h": "360",
  "12h": "720",
  "1D": "D",
  "1W": "W",
  "1M": "M",
};

export function TradingViewWidget({
  symbol,
  timeframe,
}: {
  symbol: string;
  timeframe: string;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    node.replaceChildren();
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.type = "text/javascript";
    script.text = JSON.stringify({
      autosize: true,
      symbol: symbolMap[symbol] ?? "BINANCE:BTCUSDT",
      interval: intervalMap[timeframe] ?? "15",
      timezone: "Etc/UTC",
      theme: "dark",
      backgroundColor: "rgba(8, 13, 19, 1)",
      gridColor: "rgba(24, 33, 45, 0.65)",
      style: "1",
      locale: "en",
      withdateranges: true,
      hide_side_toolbar: false,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      support_host: "https://www.tradingview.com",
    });
    node.append(widget, script);
    return () => node.replaceChildren();
  }, [symbol, timeframe]);

  return (
    <div className="tv-frame">
      <div
        ref={host}
        className="tradingview-widget-container"
        aria-label={`TradingView public chart for ${symbol}`}
      />
      <div className="chart-disclosure">
        TradingView public widget · reference chart only · execution uses Axiom
        demo feed
      </div>
    </div>
  );
}
