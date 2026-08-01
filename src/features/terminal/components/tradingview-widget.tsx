"use client";

import { useEffect, useRef } from "react";

const symbolMap: Record<string, string> = {
  "BTC/USD": "PYTH:BTCUSD",
  "ETH/USD": "PYTH:ETHUSD",
  "SOL/USD": "PYTH:SOLUSD",
  "XRP/USD": "PYTH:XRPUSD",
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
  theme,
}: {
  symbol: string;
  timeframe: string;
  theme: "dark" | "light";
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
      symbol: symbolMap[symbol] ?? "PYTH:BTCUSD",
      interval: intervalMap[timeframe] ?? "15",
      timezone: "Etc/UTC",
      theme,
      backgroundColor:
        theme === "light" ? "rgba(255, 255, 255, 1)" : "rgba(8, 13, 19, 1)",
      gridColor:
        theme === "light"
          ? "rgba(217, 224, 230, 0.8)"
          : "rgba(24, 33, 45, 0.65)",
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
  }, [symbol, theme, timeframe]);

  return (
    <div className="tv-frame">
      <div
        ref={host}
        className="tradingview-widget-container"
        aria-label={`TradingView PYTH chart for ${symbol}`}
      />
      <div className="chart-disclosure">
        TradingView tools · {symbolMap[symbol] ?? "PYTH:BTCUSD"} market data ·
        simulated execution stays server-authoritative
      </div>
    </div>
  );
}
