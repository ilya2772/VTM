# Статус реализации

Допустимые состояния: **не начат**, **в работе**, **готов**, **заблокирован**.

|   № | Этап                                             | Состояние | Последняя проверка                                                              | Примечание                                                                                          |
| --: | ------------------------------------------------ | --------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
|   1 | Каркас приложения и инженерные правила           | готов     | 2026-07-25: `pnpm check`, `pnpm build`, HTTP smoke                              | Next.js App Router, strict TypeScript, Tailwind, Vitest и Playwright настроены                      |
|   2 | Схема PostgreSQL, Prisma и seed                  | готов     | 2026-07-25: migrate deploy, seed x2, DB counts, `pnpm check/build`              | PostgreSQL 17: обе миграции применены, повторный seed без дублей                                    |
|   3 | Аутентификация и базовая защита API              | готов     | 2026-07-25: real DB login/session/logout, `pnpm check/build`                    | HttpOnly session создана и отозвана; AuditLog подтверждён в PostgreSQL                              |
|   4 | Доменная математика исполнения                   | готов     | 2026-07-26: 14 domain tests, `pnpm check`, `pnpm build`                         | Decimal PnL, fees, execution, orders, margin, liquidation и SL/TP                                   |
|   5 | Risk engine и жизненный цикл challenge           | готов     | 2026-07-26: 12 risk tests, `pnpm check`, `pnpm build`                           | Equity/drawdown, timezone reset, passed/failed, violations и блокировка                             |
|   6 | Market-data gateway и demo-feed                  | готов     | 2026-08-01: Pyth adapter tests, `pnpm check`, `pnpm build`                      | BTC/ETH/SOL/XRP Pyth latest-price, stale guard, fail-closed SSE и явный demo mode                   |
|   7 | Транзакционный execution service и API           | готов     | 2026-08-02: PostgreSQL integration ×4, `pnpm check/build`                       | Несколько независимых позиций, atomic open/partial/full close, replay, rollback, API и audit        |
|   8 | UI foundation и адаптивный shell                 | готов     | 2026-07-26: components, browser 1440/768/390, `pnpm check/build`                | Responsive 3-panel shell, mobile tabs, themes, focus и honest empty states                          |
|   9 | График и ChartProvider                           | готов     | 2026-08-01: browser 1701×967, screenshot 3402×1934, `pnpm check/build`          | Variant 1: расширенный TradingView, четыре PYTH-символа выбираются только в Markets                 |
|  10 | Order ticket и подтверждение                     | готов     | 2026-08-01: component tests + Playwright ×2, `pnpm check/build`                 | Market/Limit/Stop Limit, Long/Short, sizing, SL/TP и authoritative preview восстановлены            |
|  11 | Панели challenge, позиций, ордеров и риска       | готов     | 2026-08-01: SOL full journey, responsive/keyboard Playwright                    | Selected-market filtering, SL/TP edit, partial/full market close, cancel, history и risk            |
|  12 | Остальные продуктовые разделы                    | готов     | 2026-08-02: navigation browser 1440/390, Playwright ×2, `pnpm check/build`      | Рабочая верхняя навигация; Dashboard, Markets, Watchlist, Journal, Leaderboard, Analytics, Settings |
|  13 | Сквозной Playwright-сценарий                     | готов     | 2026-08-02: Playwright ×2, `pnpm check`, `pnpm build`                           | SOL select→tick→TP/SL→preview→две Long→edit→partial/full close→Short; desktop/mobile                |
|  14 | Production hardening и финальная приёмка         | готов     | 2026-07-27: `pnpm check`, DB integration ×3, Playwright ×2, build, prod headers | Rate limits, concurrent serialization, stale/reconnect, responsive/keyboard, clean-deploy docs      |
|  15 | Asset selector, Risk Score, Challenges и Profile | готов     | 2026-08-02: основной gate + Playwright layout regression ×2                     | Динамический risk/AI Coach, checkout, challenge switch; chart overflow исправлен                    |

## Последняя production-проверка

- 2026-08-02: быстрый выбор размера позиции заменён доступной с клавиатуры
  компактной шкалой 0/25/50/75/100%, размер теперь рассчитывается от доступной маржи
  (`equity − used margin`), а отрицательный прогресс Profit Target отображается
  со знаком минус. Проверено Prettier, ESLint, strict TypeScript, Vitest (90
  пройдено, 4 пропущено), production build и Playwright desktop/mobile (2).
- 2026-08-02: Fullscreen возвращён в правую часть панели графика и оптически
  выровнен по вертикали, а demo-feed теперь всегда помечается `DEMO`, чтобы его
  цена не выглядела как live Pyth. Проверено Prettier, ESLint, strict TypeScript
  и component tests (8).
- 2026-08-02: production build теперь явно запускает `prisma generate`, чтобы
  Vercel не использовал устаревший Prisma Client из build cache. Проверено
  последовательностью Prisma generate → Next.js production build.
- 2026-08-02: desktop shell ограничен высотой viewport, прокрутка нескольких
  позиций перенесена внутрь activity panel, а текст Fullscreen выровнен по
  центру. Проверено целевыми component tests (9) и Playwright regression (2).
- 2026-08-02: реализован сквозной пакет asset selector → Risk Score/AI Coach →
  Challenges/Profile → test checkout/webhook. Чистая временная PostgreSQL БД
  успешно получила все миграции и seed в Playwright global setup. Проверено:
  Prettier, ESLint, strict TypeScript, Vitest (89 пройдено, 4 пропущено),
  production build и Playwright (3 сценария). Настроенная в `.env.local` БД на
  `127.0.0.1:55446` во время проверки была недоступна, поэтому она вручную не
  обновлялась.
- 2026-08-02: добавлена идемпотентная миграция полного Pyth market universe
  (BTC/ETH/SOL/XRP), а источник цены позиции отображается по активному
  server-only market-data mode, а не по устаревшему полю инструмента.
- Проверено: `CI=true pnpm check` (78 тестов пройдено, 4 пропущено) и
  `CI=true pnpm build`.

## Правило обновления

В начале разрешённого этапа его состояние меняется на **в работе**. После реализации и успешных подходящих тестов — на **готов** с указанием проверки. При объективной внешней блокировке — на **заблокирован** с конкретной причиной. За один запуск изменяется и выполняется не более одного этапа; следующий этап автоматически не начинается.
