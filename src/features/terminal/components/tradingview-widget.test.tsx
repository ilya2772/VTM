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
});
