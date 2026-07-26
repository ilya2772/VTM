# Axiom Prop Terminal

A production-oriented virtual prop-trading terminal. The project simulates trading only: it does not use real money, submit exchange orders or perform blockchain transactions.

The repository contains the verified engineering, database, authentication, market-data, execution, risk and responsive terminal foundations tracked in `STATUS.md`. Remaining product capabilities are added according to `IMPLEMENTATION_PLAN.md`.

## Requirements

- Node.js 20.9 or newer
- pnpm 11

PostgreSQL is required from stage 2 onward. Pyth Pro credentials and licensed TradingView Advanced Charts files are not required for the foundation.

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

The checked-in environment example defaults to clearly identified demo market data and the open-source Lightweight Charts adapter. Replace placeholder database credentials locally; never commit real credentials.

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
pnpm test:watch    # Vitest watch mode
pnpm test:e2e      # Playwright tests (added with product flows)
pnpm check         # formatting, lint, types and unit tests
```

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

`MARKET_DATA_MODE=demo` exposes a deterministic SSE feed at `/api/market/stream` and labels every event `DEMO`. The browser contract distinguishes `LIVE`, `DEMO`, `RECONNECTING`, `STALE`, and `ERROR`; unsupported volume, funding, and open-interest fields are returned as `null` and rendered as `N/A`. Pyth integer price and confidence values are normalized with their exponent on the server. The API key is read only by the server adapter and never included in URLs, responses, or logs. A tick is executable through the configured stale threshold, then new execution is rejected. Reconnect clients use capped exponential backoff, and OHLC aggregation de-duplicates identical ticks before building timestamp buckets.

## Transactional trading API

Authenticated, same-origin requests create or cancel orders through `/api/trading/orders` and close positions through `/api/trading/positions/close`. The client supplies intent and an idempotency key, but never supplies an authoritative market price, balance, PnL, fee, or risk result. The server obtains a fresh tick, repeats all limits and Decimal calculations, and writes orders, fills, trades, positions, equity/risk snapshots, violations, account state, and audit records inside one Prisma transaction. Reusing an account/idempotency-key pair returns the original order. A rejected command rolls back without partial records, and a close that would produce a negative balance is rejected.

## Integrated terminal UI

The terminal UI adapts the project-root `index.html` concept into the Next.js application. Account, challenge, position, order, trade and risk panels load from the authenticated PostgreSQL-backed server state. Market, Limit and Stop Limit intents use the transactional API; the browser does not determine the authoritative execution result.

The default visual chart is TradingView's official public Advanced Chart embed using TradingView's Pyth symbols (`PYTH:BTCUSD` and `PYTH:ETHUSD`). It restores TradingView drawing tools and indicators while showing the live and historical Pyth Price Feeds distributed by TradingView. Simulated execution remains independent and server-authoritative through Axiom's Pyth/demo gateway; browser chart values are never accepted for execution.

No licensed self-hosted TradingView Advanced Charts assets are included or imitated. The custom `ChartProvider` and Lightweight Charts implementation remains available in the codebase for a direct Axiom datafeed, but it is not the default visual chart while the official TradingView embed supplies the requested tools.

The order ticket supports Market, Limit and Stop Limit for Long and Short, sizing in USD or asset units, leverage, quick percentages, Stop Loss and Take Profit. Before confirmation, the authenticated `/api/trading/orders/preview` endpoint converts size using the authoritative server price and validates account, challenge, stale-price and risk limits. The confirmation displays expected execution, fee, margin, liquidation, potential P/L and risk/reward. Submission reuses a stable idempotency key and repeats the same server calculations before creating any simulated order.

Challenge progress, recent trades, positions, pending orders, history and risk limits are presented from the authenticated server state. Open-position PnL follows the selected instrument's live server tick without a page reload. Position controls update or clear protective targets and support exact partial or full simulated closes through server-authoritative APIs; pending orders can be cancelled. The risk panel shows daily and overall drawdown, remaining percentage and currency allowance, and explicit violation or trading-block explanations.

Dashboard, Markets, Watchlist, Journal, Leaderboard, Analytics and Settings are functional terminal workspaces rather than placeholders. Watchlist membership and the default chart layout are persisted for the authenticated user in PostgreSQL. Journal and analytics use recorded simulated trades, while the leaderboard ranks stored simulation accounts by realized return; unsupported market fields remain explicitly `N/A`.

## Secret-handling rules

- `PYTH_PRO_API_KEY`, database credentials and future session secrets are server-only.
- Secrets must not use the `NEXT_PUBLIC_` prefix, be serialized into props, appear in API responses or be logged.
- Pyth requests requiring an API key are proxied through a backend gateway.
- `.env*` files are ignored except for the safe `.env.example` template.
- Licensed TradingView Advanced Charts assets are obtained only through official access and are excluded from source control.

## Environment variables

| Name               | Exposure             | Purpose                                          |
| ------------------ | -------------------- | ------------------------------------------------ |
| `DATABASE_URL`     | server-only          | PostgreSQL connection string                     |
| `PYTH_PRO_API_KEY` | server-only          | Pyth Pro API credential; empty in demo mode      |
| `PYTH_CHANNEL`     | server-only          | Pyth streaming channel                           |
| `MARKET_DATA_MODE` | server configuration | `pyth` or visibly labelled `demo` mode           |
| `CHART_ENGINE`     | server configuration | `tradingview` or `lightweight` adapter selection |

## Planning documents

- `PRODUCT_SPEC.md` is the source of product requirements.
- `IMPLEMENTATION_PLAN.md` defines the ordered delivery stages.
- `STATUS.md` records the verified state of each stage.
