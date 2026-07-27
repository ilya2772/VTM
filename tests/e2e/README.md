# End-to-end tests

`trading-journey.spec.ts` covers the required login → BTC/USD → timeframe → Long → live PnL → SL/TP → close → History/Journal journey.

Run it with:

```bash
pnpm test:e2e
```

The Playwright global setup creates a temporary PostgreSQL 17 cluster under the operating-system temporary directory, applies migrations and the repeatable demo seed, and removes the cluster after the run. The application uses its local deterministic `MARKET_DATA_MODE=demo` stream, while the external TradingView script is blocked in the scenario. No production database, Pyth key, live market, or network-dependent chart is required.
