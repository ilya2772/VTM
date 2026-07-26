"use client";

import Decimal from "decimal.js";

import type { TerminalState } from "./types";

export type ProductWorkspace =
  | "Dashboard"
  | "Trade"
  | "Markets"
  | "Watchlist"
  | "Journal"
  | "Leaderboard"
  | "Analytics"
  | "Settings";

export const productWorkspaces: readonly ProductWorkspace[] = [
  "Dashboard",
  "Trade",
  "Markets",
  "Watchlist",
  "Journal",
  "Leaderboard",
  "Analytics",
  "Settings",
];

interface Props {
  workspace: Exclude<ProductWorkspace, "Trade">;
  state: TerminalState;
  selectedInstrumentId: string;
  timeframe: string;
  theme: "dark" | "light";
  busy: boolean;
  message: string;
  onSelectInstrument(id: string): void;
  onToggleWatchlist(id: string, enabled: boolean): Promise<void>;
  onSaveLayout(theme: "dark" | "light"): Promise<void>;
}

const cash = (value: string, signed = false) => {
  const amount = new Decimal(value);
  return `${signed && amount.gt(0) ? "+" : ""}${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount.toNumber())}`;
};

export function ProductWorkspaces(props: Props) {
  const { state, workspace } = props;
  const closed = state.trades.filter((trade) => trade.closedAt);
  const wins = closed.filter((trade) => new Decimal(trade.realizedPnl).gt(0));
  const losses = closed.filter((trade) => new Decimal(trade.realizedPnl).lt(0));
  const grossProfit = wins.reduce(
    (sum, trade) => sum.plus(trade.realizedPnl),
    new Decimal(0),
  );
  const grossLoss = losses.reduce(
    (sum, trade) => sum.plus(new Decimal(trade.realizedPnl).abs()),
    new Decimal(0),
  );
  const realized = closed.reduce(
    (sum, trade) => sum.plus(trade.realizedPnl),
    new Decimal(0),
  );
  const watched = state.instruments.filter((item) =>
    state.watchlistInstrumentIds.includes(item.id),
  );
  const marketList = workspace === "Watchlist" ? watched : state.instruments;

  return (
    <section
      className="product-workspace"
      aria-label={`${workspace} workspace`}
    >
      <header className="product-workspace-head">
        <div>
          <span>Axiom simulation</span>
          <h1>{workspace}</h1>
        </div>
        <p>
          Server-backed account data ·{" "}
          {new Date(state.serverTime).toLocaleString()}
        </p>
      </header>

      {workspace === "Dashboard" && (
        <div className="product-grid metrics">
          {[
            ["Balance", cash(state.account.balance)],
            ["Equity", cash(state.account.equity)],
            ["Unrealized PnL", cash(state.account.unrealizedPnl, true)],
            ["Challenge", state.challenge?.status ?? "N/A"],
            [
              "Trading days",
              `${state.challenge?.tradingDays ?? 0} / ${state.challenge?.rules?.minTradingDays ?? "N/A"}`,
            ],
            ["Open positions", String(state.positions.length)],
          ].map(([label, value]) => (
            <article key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
      )}

      {(workspace === "Markets" || workspace === "Watchlist") && (
        <div className="product-table" role="table" aria-label={workspace}>
          {marketList.length ? (
            marketList.map((item) => {
              const enabled = state.watchlistInstrumentIds.includes(item.id);
              return (
                <article key={item.id} role="row">
                  <button onClick={() => props.onSelectInstrument(item.id)}>
                    <strong>{item.symbol}</strong>
                    <small>{item.displayName}</small>
                  </button>
                  <span>{item.source} · volume/funding/OI N/A</span>
                  <button
                    disabled={props.busy}
                    aria-label={`${enabled ? "Remove" : "Add"} ${item.symbol} ${enabled ? "from" : "to"} watchlist`}
                    onClick={() =>
                      void props.onToggleWatchlist(item.id, !enabled)
                    }
                  >
                    {enabled ? "★ Watching" : "☆ Add"}
                  </button>
                </article>
              );
            })
          ) : (
            <div className="product-empty">
              Watchlist is empty. Add a market from Markets.
            </div>
          )}
        </div>
      )}

      {workspace === "Journal" && (
        <div
          className="product-table"
          role="table"
          aria-label="Closed trade journal"
        >
          {closed.length ? (
            closed.map((trade) => (
              <article key={trade.id} role="row">
                <span>
                  <strong>
                    {trade.symbol} {trade.side}
                  </strong>
                  <small>
                    {new Date(
                      trade.closedAt ?? trade.openedAt,
                    ).toLocaleString()}
                  </small>
                </span>
                <span>
                  Entry {cash(trade.entryPrice)} · Exit{" "}
                  {trade.exitPrice ? cash(trade.exitPrice) : "N/A"} · Fees{" "}
                  {cash(trade.fees)}
                </span>
                <strong
                  className={
                    new Decimal(trade.realizedPnl).gte(0) ? "green" : "red"
                  }
                >
                  {cash(trade.realizedPnl, true)}
                </strong>
              </article>
            ))
          ) : (
            <div className="product-empty">No closed simulated trades yet.</div>
          )}
        </div>
      )}

      {workspace === "Leaderboard" && (
        <div
          className="product-table leaderboard"
          role="table"
          aria-label="Simulation leaderboard"
        >
          {state.leaderboard.length ? (
            state.leaderboard.map((row, index) => (
              <article key={row.userId} role="row">
                <strong>#{index + 1}</strong>
                <span>
                  <strong>{row.displayName}</strong>
                  <small>{row.challengeStatus ?? "N/A"}</small>
                </span>
                <span
                  className={
                    new Decimal(row.returnPct).gte(0) ? "green" : "red"
                  }
                >
                  {new Decimal(row.returnPct).toFixed(2)}% ·{" "}
                  {cash(row.realizedPnl, true)}
                </span>
              </article>
            ))
          ) : (
            <div className="product-empty">No ranked simulation accounts.</div>
          )}
        </div>
      )}

      {workspace === "Analytics" && (
        <div className="product-grid metrics">
          <article>
            <span>Closed trades</span>
            <strong>{closed.length}</strong>
          </article>
          <article>
            <span>Win rate</span>
            <strong>
              {closed.length
                ? new Decimal(wins.length)
                    .div(closed.length)
                    .mul(100)
                    .toFixed(2)
                : "0.00"}
              %
            </strong>
          </article>
          <article>
            <span>Realized PnL</span>
            <strong className={realized.gte(0) ? "green" : "red"}>
              {cash(realized.toString(), true)}
            </strong>
          </article>
          <article>
            <span>Profit factor</span>
            <strong>
              {grossLoss.gt(0)
                ? grossProfit.div(grossLoss).toFixed(2)
                : grossProfit.gt(0)
                  ? "∞"
                  : "N/A"}
            </strong>
          </article>
          <article>
            <span>Best trade</span>
            <strong>
              {closed.length
                ? cash(
                    Decimal.max(
                      ...closed.map((t) => new Decimal(t.realizedPnl)),
                    ).toString(),
                    true,
                  )
                : "N/A"}
            </strong>
          </article>
          <article>
            <span>Worst trade</span>
            <strong>
              {closed.length
                ? cash(
                    Decimal.min(
                      ...closed.map((t) => new Decimal(t.realizedPnl)),
                    ).toString(),
                    true,
                  )
                : "N/A"}
            </strong>
          </article>
        </div>
      )}

      {workspace === "Settings" && (
        <div className="settings-panel">
          <div>
            <span>Saved market</span>
            <strong>
              {state.instruments.find(
                (item) => item.id === props.selectedInstrumentId,
              )?.symbol ?? "N/A"}
            </strong>
          </div>
          <div>
            <span>Saved timeframe</span>
            <strong>{props.timeframe}</strong>
          </div>
          <div>
            <span>Chart provider</span>
            <strong>TradingView · PYTH</strong>
          </div>
          <label>
            Theme
            <select
              aria-label="Theme"
              value={props.theme}
              onChange={(event) =>
                void props.onSaveLayout(
                  event.target.value === "light" ? "light" : "dark",
                )
              }
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>
          <button
            disabled={props.busy}
            onClick={() => void props.onSaveLayout(props.theme)}
          >
            Save chart layout
          </button>
          <p role="status">
            {props.message ||
              "Settings are persisted to your server-side ChartLayout."}
          </p>
        </div>
      )}
    </section>
  );
}
