# Статус реализации

Допустимые состояния: **не начат**, **в работе**, **готов**, **заблокирован**.

|   № | Этап                                       | Состояние | Последняя проверка                                                              | Примечание                                                                                               |
| --: | ------------------------------------------ | --------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
|   1 | Каркас приложения и инженерные правила     | готов     | 2026-07-25: `pnpm check`, `pnpm build`, HTTP smoke                              | Next.js App Router, strict TypeScript, Tailwind, Vitest и Playwright настроены                           |
|   2 | Схема PostgreSQL, Prisma и seed            | готов     | 2026-07-25: migrate deploy, seed x2, DB counts, `pnpm check/build`              | PostgreSQL 17: обе миграции применены, повторный seed без дублей                                         |
|   3 | Аутентификация и базовая защита API        | готов     | 2026-07-25: real DB login/session/logout, `pnpm check/build`                    | HttpOnly session создана и отозвана; AuditLog подтверждён в PostgreSQL                                   |
|   4 | Доменная математика исполнения             | готов     | 2026-07-26: 14 domain tests, `pnpm check`, `pnpm build`                         | Decimal PnL, fees, execution, orders, margin, liquidation и SL/TP                                        |
|   5 | Risk engine и жизненный цикл challenge     | готов     | 2026-07-26: 12 risk tests, `pnpm check`, `pnpm build`                           | Equity/drawdown, timezone reset, passed/failed, violations и блокировка                                  |
|   6 | Market-data gateway и demo-feed            | готов     | 2026-07-26: 5 market tests, `pnpm check`, `pnpm build`                          | Pyth normalization, stale guard, OHLC, backoff, demo SSE                                                 |
|   7 | Транзакционный execution service и API     | готов     | 2026-07-26: PostgreSQL integration x2, `pnpm check/build`                       | Atomic open/partial/full close, replay, rollback, API и audit                                            |
|   8 | UI foundation и адаптивный shell           | готов     | 2026-07-26: components, browser 1440/768/390, `pnpm check/build`                | Responsive 3-panel shell, mobile tabs, themes, focus и honest empty states                               |
|   9 | График и ChartProvider                     | готов     | 2026-07-26: 6 chart tests, TradingView/PYTH browser smoke, `pnpm check/build`   | Public TradingView tools с `PYTH:BTCUSD`/`PYTH:ETHUSD`; server execution остаётся независимым            |
|  10 | Order ticket и подтверждение               | готов     | 2026-07-26: 8 order/route tests, browser 1440/390, `pnpm check/build`           | USD/asset, quick %, SL/TP, authoritative preview, fee/margin/liquidation/P&L/RR и stable idempotency key |
|  11 | Панели challenge, позиций, ордеров и риска | готов     | 2026-07-26: 5 targets/route + UI tests, browser 1440/390, `pnpm check/build`    | Live PnL, SL/TP edit, partial/full close, cancel, history и объяснения risk limits                       |
|  12 | Остальные продуктовые разделы              | готов     | 2026-07-26: 4 workspace/persistence tests, browser 1440/390, `pnpm check/build` | Dashboard, Markets, Watchlist, Journal, Leaderboard, Analytics, Settings и ChartLayout persistence       |
|  13 | Сквозной Playwright-сценарий               | не начат  | —                                                                               | —                                                                                                        |
|  14 | Production hardening и финальная приёмка   | не начат  | —                                                                               | —                                                                                                        |

## Правило обновления

В начале разрешённого этапа его состояние меняется на **в работе**. После реализации и успешных подходящих тестов — на **готов** с указанием проверки. При объективной внешней блокировке — на **заблокирован** с конкретной причиной. За один запуск изменяется и выполняется не более одного этапа; следующий этап автоматически не начинается.
