# Axiom Prop Terminal

A production-oriented virtual prop-trading terminal. The project simulates trading only: it does not use real money, submit exchange orders or perform blockchain transactions.

The repository contains the staged implementation tracked in `STATUS.md`. The final acceptance commands and known external limitations are documented below.

## Requirements

- Node.js 20.9 or newer
- pnpm 11

PostgreSQL is required. Pyth Pro credentials and licensed TradingView Advanced Charts files are optional for the deterministic local demo path.

## Database setup

Stage 2 adds the PostgreSQL schema and repeatable demo seed. Set `DATABASE_URL` in `.env.local`, then run:

```bash
pnpm db:validate
pnpm db:generate
pnpm db:deploy
pnpm db:seed
```

The database commands load `.env.local`. Use `db:migrate` while authoring a new migration and `db:deploy` to apply checked-in migrations. `db:seed` uses stable IDs and upserts, so rerunning it does not create duplicate demo users, accounts, challenge rules, instruments, or the baseline equity snapshot. The seeded account is explicitly `DEMO` data: 50,000 USDT, a 10% target, 5% daily loss limit, 10% overall loss limit, three minimum trading days, and UTC day boundaries.

The local demo credentials are `demo@axiom.local` / `AxiomDemo!2026`. They are intentionally public demo credentials and must not be reused for a production account.

## Authentication security

- Passwords use Node.js scrypt with a per-password salt and timing-safe verification.
- Successful login creates an opaque random session token; only its SHA-256 hash is stored in PostgreSQL.
- The browser receives the token only in an HttpOnly, SameSite=Lax cookie. Production cookies are also Secure.
- State-changing auth routes reject requests whose `Origin` does not match the request origin.
- Login attempts are rate-limited by normalized email and client address.
- Login success/failure and logout are recorded in `AuditLog` without storing passwords or session tokens.
- The in-memory rate limiter protects a single application process. A shared Redis/database limiter is required before horizontally scaling the deployment.

## First run

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`.

The checked-in environment example defaults to fail-closed Pyth mode. Configure the server-only `PYTH_PRO_API_KEY`, or explicitly select `MARKET_DATA_MODE=demo` for clearly labelled deterministic local data. Replace placeholder database credentials locally; never commit real credentials.

## Clean deployment

From a clean checkout with an empty PostgreSQL database:

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
# Set a dedicated DATABASE_URL in .env.local.
pnpm db:validate
pnpm db:generate
pnpm db:deploy
pnpm db:seed
pnpm check
pnpm build
pnpm start
```

The database role referenced by `DATABASE_URL` must already exist and own, or have create privileges on, the target database. Use `pnpm db:deploy`, not `db:migrate`, in a deployed environment. Run the application behind HTTPS and a trusted reverse proxy, set `NODE_ENV=production`, keep `.env.local` outside source control, and replace the public demo login before exposing an instance beyond a controlled simulation environment.

## Commands

```bash
pnpm dev           # local Next.js development server
pnpm build         # production build
pnpm start         # serve the production build
pnpm lint          # ESLint, with warnings treated as failures
pnpm typecheck     # strict TypeScript check
pnpm format        # format supported files
pnpm format:check  # verify formatting
pnpm test          # Vitest unit tests
pnpm test:integration # PostgreSQL transactional/concurrency tests
pnpm test:watch    # Vitest watch mode
pnpm test:e2e      # isolated PostgreSQL + deterministic Playwright journey
pnpm check         # formatting, lint, types and unit tests
```

`pnpm test:integration` uses `DATABASE_URL` from the current environment and must target a disposable seeded test database. `pnpm test:e2e` creates and removes an isolated local PostgreSQL 17 cluster; it requires the PostgreSQL server binaries (`initdb`, `pg_ctl`, and `createdb`) to be installed. The E2E scenario blocks the external TradingView script and never depends on live market data.

## Module boundaries

- `src/app` contains App Router routes, layouts, loading/error boundaries and route handlers.
- `src/features` contains cohesive product features and their UI/client orchestration.
- `src/server` contains authoritative server-only services: database access, execution, risk, authentication and market-data credentials.
- `src/shared` contains pure cross-runtime types, schemas and deterministic helpers with no access to secrets or server APIs.
- Client Components are opt-in with `"use client"`. Server Components remain the default.
- Client code may call validated route handlers or server actions; it must not import `src/server`.

## Money and Decimal rules

- Balance, equity, fees, margin, price-derived PnL and all persisted monetary values use an arbitrary-precision Decimal implementation introduced with the domain/data layers.
- JavaScript `number` must not be used for authoritative money calculations. Numbers may be used only for non-authoritative display geometry or chart coordinates after explicit conversion.
- Decimal values cross HTTP boundaries as canonical decimal strings and are parsed and validated again on the server.
- Rounding scale and mode belong to the relevant domain policy; callers must not round implicitly.
- The server recalculates price, PnL, balance and risk metrics and never trusts those values from a browser.

## Simulated execution model

The terminal is a deterministic simulator and never routes orders to an exchange. The server treats the oracle price as a mid-price and computes an adverse execution price transparently:

- Buy: `oracle × (1 + spreadBps / 2 / 10,000 + slippageBps / 10,000)`.
- Sell: `oracle × (1 - spreadBps / 2 / 10,000 - slippageBps / 10,000)`.
- Long PnL: `quantity × (exit - entry)`; Short PnL reverses the price difference.
- Fees: `quantity × executionPrice × feeBps / 10,000`. Maker and taker rates are supplied explicitly by the caller.
- Initial margin: `notional / leverage`.
- Liquidation uses configurable maintenance margin `m`: Long is `entry × (1 - 1/leverage) / (1 - m)` and Short is `entry × (1 + 1/leverage) / (1 + m)`. Closing fees are not included in this boundary and must be charged separately when execution occurs.

Market orders are immediately executable. Buy Limits execute when market price is at or below the limit; Sell Limits use the opposite comparison. Buy Stops trigger at or above the stop and Sell Stops at or below it. A Stop Limit remains activated after its stop is crossed, then follows the normal Limit rule. SL, TP and liquidation comparisons include the exact boundary. Partial close realizes PnL and an exit fee only for the closed quantity.

All authoritative inputs are decimal strings or `Decimal` instances; JavaScript `number` is excluded from the API. Intermediate operations retain 40-digit precision. Prices, money/PnL/fees and rates round half-up to 8 decimal places at returned domain boundaries; quantities round half-up to 12 places. Persistence and HTTP serialization must use canonical decimal strings.

## Challenge risk model

The risk engine evaluates an account from authoritative server values. Percent rules in `ChallengeRules` are stored as percentage points (`5` means 5%, not `0.05`). Returned monetary values and percentages follow the Decimal rounding policy above.

- `realized PnL = balance - initial balance`.
- `unrealized PnL = sum of open-position PnL`.
- `equity = balance + unrealized PnL`.
- `peak equity = max(previous peak equity, current equity)`.
- `daily drawdown % = max(0, daily starting equity - equity) / daily starting equity × 100`.
- `overall drawdown % = max(0, initial balance - equity) / initial balance × 100`.
- `profit % = max(0, equity - initial balance) / initial balance × 100`.

The trading day is the calendar date in the challenge's IANA timezone. UTC is the seed default. On the first evaluation whose local date differs from the stored `DailyRiskSnapshot.tradingDate`, current equity becomes that day's starting equity before daily drawdown is evaluated. This makes the reset deterministic even across daylight-saving changes. A trading day counts once when at least one qualifying execution occurred on that local date.

Daily and overall loss limits breach inclusively at the configured percentage. Either breach produces a structured violation, moves an active challenge to `FAILED`, and blocks new orders. The engine requests closing open positions only when `closePositionsOnBreach` is enabled. A challenge moves to `PASSED` only when both the profit target and minimum distinct trading days are reached. Failure takes precedence, and `PASSED`/`FAILED` are terminal states. The engine returns persistence-ready decisions; the transactional service introduced in stage 7 persists challenge updates, snapshots, and violations atomically.

## Market data gateway

`MARKET_DATA_MODE=pyth` polls Pyth Pro's authenticated `/v1/latest_price` endpoint on the server for BTC/USD, ETH/USD, SOL/USD and XRP/USD, then exposes the selected feed through `/api/market/stream`. `MARKET_DATA_MODE=demo` uses the same server gateway with deterministic ticks and labels every market `DEMO`. The browser contract distinguishes `LIVE`, `DEMO`, `RECONNECTING`, `STALE`, and `ERROR`; unsupported volume, funding, and open-interest fields are returned as `null` and rendered as `N/A`. Pyth integer price and confidence values are normalized with their exponent on the server. The API key is never included in browser code, URLs, responses, or logs. A tick is executable only through `PYTH_STALE_AFTER_MS`; stale or unavailable prices block preview and new execution without a demo fallback.

To request a Pyth Pro key, follow the [official Pyth key guide](https://docs.pyth.network/price-feeds/pro/acquire-api-key) and consult the [official API reference](https://docs.pyth.network/price-feeds/pro/api). Store the key only as `PYTH_PRO_API_KEY` on the server. Pyth mode never silently falls back to demo prices. The internal historical-data route still returns `503` in Pyth mode; the visible TradingView embed supplies chart history independently and is never an execution-price source.

## Transactional trading API

Authenticated, same-origin requests create or cancel orders through `/api/trading/orders` and close positions through `/api/trading/positions/close`. The client supplies intent and an idempotency key, but never supplies an authoritative market price, balance, PnL, fee, or risk result. The server obtains a fresh tick, repeats all limits and Decimal calculations, and writes orders, fills, trades, positions, equity/risk snapshots, violations, account state, and audit records inside one Prisma transaction. Reusing an account/idempotency-key pair returns the original order. A rejected command rolls back without partial records, and a close that would produce a negative balance is rejected.

## Integrated terminal UI

The terminal UI adapts the project-root `index.html` concept into the Next.js application. Account, challenge, position, order, trade and risk panels load from the authenticated PostgreSQL-backed server state. Market, Limit and Stop Limit intents use the transactional API; the browser does not determine the authoritative execution result.

The default visual chart is TradingView's official public Advanced Chart embed using TradingView's Pyth symbols (`PYTH:BTCUSD`, `PYTH:ETHUSD`, `PYTH:SOLUSD`, and `PYTH:XRPUSD`). The accessible top-bar selector searches tickers and names, filters market groups, persists the selected instrument, and reuses the server watchlist for favorites. Selection switches the chart, server feed, order ticket, positions, orders, Risk Score, and AI Coach together. Simulated execution remains independent and server-authoritative through Axiom's Pyth/demo gateway; browser chart values are never accepted for execution.

No licensed self-hosted TradingView Advanced Charts assets are included or imitated. The custom `ChartProvider` and Lightweight Charts implementation remains available in the codebase for a direct Axiom datafeed, but it is not the default visual chart while the official TradingView embed supplies the requested tools.

For a self-hosted Advanced Charts deployment, request access through the [official Advanced Charts page](https://www.tradingview.com/advanced-charts/) and follow TradingView's [official installation guide](https://www.tradingview.com/charting-library-docs/latest/getting_started/quick-start/). TradingView distributes the library through a restricted repository and prohibits redistribution; never commit those assets here. Until approved files are supplied, this repository uses the public TradingView embed for the visible chart and retains the Lightweight Charts adapter as the unlicensed fallback.

The order ticket supports Market, Limit and Stop Limit for Long and Short, sizing in USD or asset units, leverage, quick percentages, Stop Loss and Take Profit. Before confirmation, the authenticated `/api/trading/orders/preview` endpoint converts size using the authoritative server price and validates account, challenge, stale-price and risk limits. The confirmation displays expected execution, fee, margin, liquidation, potential P/L and risk/reward. Submission reuses a stable idempotency key and repeats the same server calculations before creating any simulated order.

Challenge progress, statistics, four markets, positions, pending orders, history and risk limits are presented from authenticated server state. Open-position PnL follows the selected instrument's live server tick without a page reload. Position controls update or clear protective targets and support exact partial or full market closes through server-authoritative APIs; pending Limit and Stop Limit orders can be cancelled. The risk panel shows daily and overall drawdown, remaining percentage and currency allowance, and explicit violation or trading-block explanations.

Dashboard, Markets, Watchlist, Journal, Leaderboard, Analytics and Settings are functional terminal workspaces rather than placeholders. Watchlist membership and the default chart layout are persisted for the authenticated user in PostgreSQL. Journal and analytics use recorded simulated trades, while the leaderboard ranks stored simulation accounts by realized return; unsupported market fields remain explicitly `N/A`.

## Risk Score and AI Coach

Risk Score starts at 100 and subtracts deterministic weighted penalties: total exposure 22, requested leverage 14, open/new trade risk 18, order size 10, missing Stop Loss 12, daily drawdown 10, overall drawdown 8, selected-asset concentration 4, and correlated positions 2. Each penalty is capped at its weight. Active server challenge violations force a score of zero. Scores map to low risk at 80–100, moderate at 60–79, high at 40–59, and critical below 40; proposed orders below 20 are rejected server-side. The UI recalculates immediately for form feedback, while preview and order placement independently repeat the calculation with authoritative account, position, rule, and price data. AI Coach turns the largest factors into Info, Warning, and Critical risk-management guidance and does not provide trade directions or profit promises.

## Challenge store and test payments

`ChallengeProduct` stores authoritative catalog pricing and rules. Checkout creates a pending `Payment` server-side from that product; browser-provided amounts are ignored. `PAYMENT_MODE=mock` provides a local test checkout that confirms through the same idempotent fulfillment service. `PAYMENT_MODE=stripe` creates Stripe Checkout Sessions with `sk_test_` credentials only. `/api/payments/webhook` verifies the raw Stripe signature before fulfillment, and a paid event atomically creates one trading account, one ready challenge, copied challenge rules, and the payment relationship. Replayed events return the existing challenge. Profile can activate only a paid Ready or already Active challenge owned by the authenticated user.

Run `pnpm db:deploy` and `pnpm db:seed` after configuring `DATABASE_URL`. For Stripe test mode, set `APP_URL`, `PAYMENT_MODE=stripe`, `STRIPE_SECRET_KEY=sk_test_...`, and `STRIPE_WEBHOOK_SECRET=whsec_...`; point the Stripe test webhook at `/api/payments/webhook` and subscribe to `checkout.session.completed`.

## Secret-handling rules

- `PYTH_PRO_API_KEY`, database credentials and future session secrets are server-only.
- Secrets must not use the `NEXT_PUBLIC_` prefix, be serialized into props, appear in API responses or be logged.
- Pyth requests requiring an API key are proxied through a backend gateway.
- `.env*` files are ignored except for the safe `.env.example` template.
- Licensed TradingView Advanced Charts assets are obtained only through official access and are excluded from source control.

## Production security controls

- State-changing routes enforce same-origin checks, authenticated ownership, strict Zod input validation, and per-user fixed-window request limits. Order previews have a separate higher limit for interactive form updates.
- Login is limited independently by normalized email and client address. API errors are non-cacheable, carry a request ID, and do not return internal exception details.
- Trading mutations acquire a PostgreSQL transaction-scoped advisory lock per account. Concurrent retries with the same idempotency key serialize to one order, and competing account mutations cannot update the same balance or position concurrently.
- Production responses enable HSTS and all responses set clickjacking, MIME-sniffing, referrer, opener, and browser-permission headers.
- The bundled limiter is process-local. Multi-instance or horizontally scaled deployment requires a shared Redis/database-backed limiter at the application or trusted edge layer.
- `X-Forwarded-For` must be overwritten by a trusted reverse proxy; do not expose the Node.js process directly while using forwarded addresses for abuse controls.

## Environment variables

| Name                    | Exposure             | Purpose                                          |
| ----------------------- | -------------------- | ------------------------------------------------ |
| `DATABASE_URL`          | server-only          | PostgreSQL connection string                     |
| `PYTH_PRO_API_KEY`      | server-only          | Pyth Pro API credential; empty in demo mode      |
| `PYTH_CHANNEL`          | server-only          | Pyth streaming channel                           |
| `PYTH_STALE_AFTER_MS`   | server configuration | Maximum executable Pyth tick age                 |
| `MARKET_DATA_MODE`      | server configuration | `pyth` or visibly labelled `demo` mode           |
| `CHART_ENGINE`          | server configuration | `tradingview` or `lightweight` adapter selection |
| `APP_URL`               | server configuration | Checkout success and cancellation origin         |
| `PAYMENT_MODE`          | server configuration | `mock` or `stripe` test checkout                 |
| `STRIPE_SECRET_KEY`     | server-only          | Stripe `sk_test_` API key                        |
| `STRIPE_WEBHOOK_SECRET` | server-only          | Stripe test webhook signing secret               |

## Known limitations

- This is simulation software only. It cannot submit exchange orders, move funds, or perform blockchain transactions.
- Pyth mode requires a Pyth Pro key and uses server-side REST polling; redundant WebSocket routing remains deployment hardening work.
- Closing an open position with a new Limit order is not supported by the current execution engine. Position-close controls execute market closes only.
- The visible TradingView chart depends on TradingView's public network embed. Licensed self-hosted Advanced Charts assets are absent by design and must come from TradingView's restricted official repository.
- Rate limits are safe for one application process only. Horizontal scaling requires a shared limiter.
- The deterministic E2E harness depends on locally installed PostgreSQL 17 command-line server tools and currently runs Chromium only.

## Planning documents

- `PRODUCT_SPEC.md` is the source of product requirements.
- `IMPLEMENTATION_PLAN.md` defines the ordered delivery stages.
- `STATUS.md` records the verified state of each stage.
