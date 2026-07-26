# AGENTS.md

## Scope

These instructions apply to the entire repository.

This project is Axiom Prop Terminal, a virtual prop-trading simulator. It must never submit real exchange orders, move real funds, or perform blockchain transactions.

Before implementation work, read `PRODUCT_SPEC.md`, `IMPLEMENTATION_PLAN.md`, and `STATUS.md`. Complete only the single stage explicitly requested by the user. Do not start the next stage automatically. After implementation, run the checks appropriate to that stage and update `STATUS.md` only after verification succeeds. Do not use subagents without separate user authorization.

## Current stack

- Node.js 20.9 or newer and pnpm 11.
- Next.js 16 with App Router and React 19.
- TypeScript 6 in strict mode.
- Tailwind CSS 4 through `@tailwindcss/postcss`.
- ESLint 9 with `eslint-config-next`; warnings fail CI-style checks.
- Prettier 3 with `prettier-plugin-tailwindcss`.
- Vitest 4, jsdom, React Testing Library, and jest-dom for unit/component tests.
- Playwright for browser end-to-end tests.

PostgreSQL, Prisma, Zod, Zustand, Radix/shadcn, Pyth integration, and chart providers are required by the product plan but are not part of the current stage-1 implementation. Do not describe a planned dependency as implemented until it exists in `package.json` and the codebase.

## Key commands

Install and configure a local checkout:

```bash
pnpm install
cp .env.example .env.local
```

Run the application:

```bash
pnpm dev
pnpm build
pnpm start
```

Run quality checks:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm check
pnpm test:e2e
```

Use `pnpm check` for the standard local gate; it runs formatting verification, lint, strict type checking, and unit tests. Run `pnpm build` separately because it is not included in `pnpm check`. Use `pnpm format` only when formatting changes are intended.

## Architecture boundaries

- Keep routes, layouts, route handlers, and framework-level boundaries in `src/app`.
- Keep cohesive product UI and client orchestration in `src/features`.
- Keep database access, authentication, market-data credentials, execution, risk calculations, and authoritative validation in `src/server`.
- Add `import "server-only"` to implemented server-only modules. Client Components must never import `src/server`.
- Keep cross-runtime types, schemas, and deterministic utilities in `src/shared`. Shared modules must not access environment variables, cookies, databases, or other server-only APIs.
- Prefer Server Components. Add `"use client"` only when browser state, browser APIs, effects, or event handlers require it.
- Use the `@/*` alias for imports from `src` when it improves clarity.

## Code rules

- Preserve strict TypeScript. Do not weaken `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, or `noFallthroughCasesInSwitch`.
- Avoid `any`, unchecked casts, and non-null assertions. Narrow unknown input explicitly and validate external data at server boundaries.
- Keep modules focused and make domain logic deterministic and independently testable.
- Use immutable data and pure functions for financial and risk calculations where practical.
- Never use JavaScript floating-point arithmetic for authoritative balances, prices, fees, margin, PnL, or risk metrics. Use the project Decimal implementation once introduced.
- Serialize Decimal values across HTTP boundaries as canonical decimal strings. Re-parse and validate them on the server.
- Treat the server as the source of truth. Never trust browser-supplied price, balance, PnL, fee, execution, or risk values.
- Keep secrets server-only. Never expose `PYTH_PRO_API_KEY`, database credentials, or session secrets through `NEXT_PUBLIC_*`, client bundles, props, API responses, snapshots, or logs.
- Keep `.env.example` free of real credentials. Do not commit `.env`, `.env.local`, or other local environment files.
- Do not commit licensed TradingView Advanced Charts files. Use only officially obtained assets and retain the documented Lightweight Charts fallback when the license is unavailable.
- Do not invent unavailable market fields such as volume, funding, open interest, or bid/ask. Render `N/A` unless a separately identified official source supplies them.
- Use Tailwind utilities and existing CSS tokens consistently. Keep interactive elements accessible by keyboard and provide visible focus, loading, empty, error, reconnect, and stale states where relevant.
- Do not add decorative or non-functional controls, silent mocks, hidden fallbacks, or unfinished TODO behavior.
- Preserve existing user changes and avoid unrelated rewrites.

## Testing rules

- Co-locate unit/component tests with source files using `*.test.ts` or `*.test.tsx`.
- Add deterministic tests for new domain behavior and regressions. Do not depend on live market data in unit or end-to-end tests.
- Use Vitest for pure logic and component behavior. Use Playwright only for browser-level user journeys.
- When changing financial logic, cover both Long and Short directions, rounding boundaries, fees, and invalid input as applicable.
- When changing streaming or time-based behavior, use controlled timestamps and deterministic fixtures; test stale, reconnect, and duplicate-event cases.
- When changing server commands, test validation, authorization, idempotency, transaction failure, and negative-balance protection as applicable.
- Do not make a failing test pass by weakening assertions or skipping coverage unless the user explicitly approves the trade-off.

## Self-check before handoff

1. Re-read the requested scope and confirm that only the authorized implementation stage or documentation task was changed.
2. Review the diff for accidental secrets, generated artifacts, licensed files, unrelated formatting, and client imports of server-only code.
3. Run `pnpm format:check` and `pnpm lint`.
4. Run `pnpm typecheck` and the relevant Vitest tests; use `pnpm test` for the complete unit suite.
5. Run `pnpm build` for changes that can affect compilation, routing, configuration, dependencies, or production output.
6. Run relevant Playwright scenarios for completed browser flows. If no Playwright scenario exists yet for the touched stage, state that clearly rather than claiming E2E coverage.
7. For UI changes, launch the app and verify the affected flow at representative desktop and mobile widths, including keyboard navigation and error states.
8. Update `STATUS.md` only after required checks pass. Record the commands run and any honest external limitation.
9. Stop after the requested stage and provide a short report with changed files, verification results, and remaining limitations.
