import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TradingViewWidget } from "./tradingview-widget";

describe("TradingViewWidget", () => {
  afterEach(cleanup);

  it("uses TradingView's PYTH symbol and keeps drawing tools enabled", () => {
    const { container } = render(
      <TradingViewWidget symbol="BTC/USD" timeframe="15m" theme="dark" />,
    );
    const script = container.querySelector("script");
    expect(script?.src).toBe(
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js",
    );
    expect(JSON.parse(script?.text ?? "{}")).toMatchObject({
      symbol: "PYTH:BTCUSD",
      interval: "15",
      hide_side_toolbar: false,
    });
  });

  it("shows open positions and working order levels over the chart", () => {
    render(
      <TradingViewWidget
        symbol="BTC/USD"
        timeframe="15m"
        theme="dark"
        positions={[
          {
            id: "position-1",
            side: "LONG",
            entryPrice: "67000",
            stopLoss: "65000",
            takeProfit: "72000",
          },
        ]}
        orders={[
          {
            id: "order-1",
            type: "STOP_LIMIT",
            side: "SHORT",
            status: "OPEN",
            limitPrice: "68000",
            stopPrice: "67900",
            stopLoss: "70000",
            takeProfit: "64000",
          },
        ]}
      />,
    );

    expect(
      document.querySelector('[aria-label="Active trade levels for BTC/USD"]'),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent("Entry $67,000.00");
    expect(document.body).toHaveTextContent("SL $65,000.00 · TP $72,000.00");
    expect(document.body).toHaveTextContent(
      "Limit $68,000.00 · Trigger $67,900.00",
    );
    expect(document.body).toHaveTextContent(
      "OPEN · SL $70,000.00 · TP $64,000.00",
    );
  });
});
