"use client";

import Decimal from "decimal.js";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { TradingViewWidget } from "./components/tradingview-widget";
import type { StreamTick, TerminalState } from "./types";

type OrderKind = "MARKET" | "LIMIT" | "STOP_LIMIT";
type Side = "LONG" | "SHORT";
type Activity = "POSITIONS" | "ORDERS" | "HISTORY" | "RISK";

function money(value: string, signed = false) {
  const amount = new Decimal(value);
  const prefix = signed && amount.gt(0) ? "+" : "";
  return `${prefix}${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount.toNumber())}`;
}

function percent(value: string) {
  return `${new Decimal(value).toFixed(2)}%`;
}

function decimalOrZero(value: string) {
  try {
    return new Decimal(value || 0);
  } catch {
    return new Decimal(0);
  }
}

function isStreamTick(value: unknown): value is StreamTick {
  if (typeof value !== "object" || value === null) return false;
  return (
    "symbol" in value &&
    "price" in value &&
    "connection" in value &&
    typeof value.symbol === "string" &&
    typeof value.price === "string"
  );
}

function isConnectionState(value: unknown): value is StreamTick["connection"] {
  return (
    value === "LIVE" ||
    value === "DEMO" ||
    value === "RECONNECTING" ||
    value === "STALE" ||
    value === "ERROR"
  );
}

function LoginPanel({ onAuthenticated }: { onAuthenticated(): Promise<void> }) {
  const [email, setEmail] = useState("demo@axiom.local");
  const [password, setPassword] = useState("AxiomDemo!2026");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      setMessage("Не удалось войти в демо-аккаунт.");
      setBusy(false);
      return;
    }
    await onAuthenticated();
  }
  return (
    <main className="fusion-login">
      <form onSubmit={submit} className="fusion-login-card">
        <span className="fusion-brand-mark">A</span>
        <p className="micro-label">Simulation access</p>
        <h1>Axiom Prop Terminal</h1>
        <p>
          Войдите в виртуальный аккаунт. Реальные деньги и биржевые заявки не
          используются.
        </p>
        <label>
          Email
          <input
            aria-label="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Пароль
          <input
            aria-label="Пароль"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button disabled={busy}>{busy ? "Вход…" : "Открыть терминал"}</button>
        <span role="status" className="form-message error">
          {message}
        </span>
      </form>
    </main>
  );
}

export function IntegratedTerminal() {
  const [state, setState] = useState<TerminalState | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedInstrumentId, setSelectedInstrumentId] = useState("");
  const [tick, setTick] = useState<StreamTick | null>(null);
  const [connectionSnapshot, setConnectionSnapshot] = useState<{
    symbol: string;
    value: StreamTick["connection"];
  }>({ symbol: "", value: "RECONNECTING" });
  const [orderKind, setOrderKind] = useState<OrderKind>("LIMIT");
  const [amount, setAmount] = useState("1000");
  const [leverage, setLeverage] = useState("1");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [activity, setActivity] = useState<Activity>("POSITIONS");
  const [confirmation, setConfirmation] = useState<Side | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const chartZone = useRef<HTMLDivElement>(null);

  const loadState = useCallback(async () => {
    const response = await fetch("/api/trading/state", { cache: "no-store" });
    if (response.status === 401) {
      setAuthRequired(true);
      setState(null);
      return;
    }
    if (!response.ok) {
      setLoadError("Не удалось загрузить состояние аккаунта.");
      return;
    }
    const next = (await response.json()) as TerminalState;
    setState(next);
    setAuthRequired(false);
    setLoadError("");
    setSelectedInstrumentId(
      (current) => current || next.instruments[0]?.id || "",
    );
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadState(), 0);
    return () => window.clearTimeout(timer);
  }, [loadState]);
  useEffect(() => {
    if (!state) return;
    const timer = window.setInterval(() => void loadState(), 5000);
    return () => window.clearInterval(timer);
  }, [state, loadState]);

  const instrument = useMemo(
    () =>
      state?.instruments.find((item) => item.id === selectedInstrumentId) ??
      state?.instruments[0] ??
      null,
    [state, selectedInstrumentId],
  );
  useEffect(() => {
    if (!instrument || typeof EventSource === "undefined") return;
    const streamSymbol = instrument.symbol;
    const events = new EventSource(
      `/api/market/stream?symbol=${encodeURIComponent(streamSymbol)}`,
    );
    events.addEventListener("tick", (event) => {
      try {
        const parsed: unknown = JSON.parse(
          (event as MessageEvent<string>).data,
        );
        if (isStreamTick(parsed)) {
          setTick(parsed);
          setLimitPrice((current) => current || parsed.price);
          setConnectionSnapshot({
            symbol: streamSymbol,
            value: parsed.connection,
          });
        }
      } catch {
        setConnectionSnapshot({ symbol: streamSymbol, value: "ERROR" });
      }
    });
    events.addEventListener("state", (event) => {
      try {
        const parsed: unknown = JSON.parse(
          (event as MessageEvent<string>).data,
        );
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "connection" in parsed &&
          isConnectionState(parsed.connection)
        )
          setConnectionSnapshot({
            symbol: streamSymbol,
            value: parsed.connection,
          });
      } catch {
        setConnectionSnapshot({ symbol: streamSymbol, value: "ERROR" });
      }
    });
    events.onerror = () =>
      setConnectionSnapshot({ symbol: streamSymbol, value: "RECONNECTING" });
    return () => events.close();
  }, [instrument]);

  if (authRequired) return <LoginPanel onAuthenticated={loadState} />;
  if (!state)
    return (
      <main className="fusion-loading">
        <span className="fusion-brand-mark">A</span>
        <strong>{loadError || "Загрузка защищённого терминала…"}</strong>
        {loadError && (
          <button onClick={() => void loadState()}>Повторить</button>
        )}
      </main>
    );
  if (!instrument)
    return (
      <main className="fusion-loading">
        <strong>Нет активных инструментов.</strong>
      </main>
    );

  const currentState = state;
  const currentInstrument = instrument;
  const connection =
    connectionSnapshot.symbol === instrument.symbol
      ? connectionSnapshot.value
      : "RECONNECTING";

  const mark =
    tick?.symbol === instrument.symbol
      ? tick.price
      : (state.positions.find(
          (position) => position.instrumentId === instrument.id,
        )?.markPrice ?? "0");
  const rules = state.challenge?.rules;
  const profit = new Decimal(state.account.equity).minus(
    state.account.initialBalance,
  );
  const targetMoney = rules
    ? new Decimal(state.account.initialBalance)
        .mul(rules.profitTargetPct)
        .div(100)
    : new Decimal(0);
  const progress = targetMoney.gt(0)
    ? Decimal.min(Decimal.max(profit, 0).div(targetMoney).mul(100), 100)
    : new Decimal(0);
  const canTrade =
    state.account.status === "ACTIVE" &&
    state.challenge?.status === "ACTIVE" &&
    (connection === "DEMO" || connection === "LIVE") &&
    new Decimal(mark).gt(0);
  const positions = state.positions;
  const selectedPositions = positions.filter(
    (position) => position.instrumentId === instrument.id,
  );
  const usedMargin = positions.reduce(
    (sum, position) =>
      sum.plus(
        new Decimal(position.quantity)
          .mul(position.entryPrice)
          .div(position.leverage),
      ),
    new Decimal(0),
  );
  const exposure = new Decimal(state.account.balance).gt(0)
    ? usedMargin.div(state.account.balance).mul(100)
    : new Decimal(0);
  const riskBlocked =
    state.challenge?.violations.some((violation) => violation.blocksTrading) ??
    false;
  const riskScore = riskBlocked
    ? 0
    : exposure.gte(75)
      ? 35
      : exposure.gte(50)
        ? 55
        : exposure.gte(25)
          ? 72
          : 92;
  const completedTrades = state.trades.filter((trade) => trade.closedAt);
  const winningTrades = completedTrades.filter((trade) =>
    new Decimal(trade.realizedPnl).gt(0),
  );
  const winRate = completedTrades.length
    ? new Decimal(winningTrades.length)
        .div(completedTrades.length)
        .mul(100)
        .toFixed(0)
    : "0";
  const bestTrade = completedTrades.reduce(
    (best, trade) => Decimal.max(best, trade.realizedPnl),
    new Decimal(0),
  );
  const worstTrade = completedTrades.reduce(
    (worst, trade) => Decimal.min(worst, trade.realizedPnl),
    new Decimal(0),
  );
  const grossProfit = completedTrades.reduce(
    (total, trade) =>
      new Decimal(trade.realizedPnl).gt(0)
        ? total.plus(trade.realizedPnl)
        : total,
    new Decimal(0),
  );
  const grossLoss = completedTrades.reduce(
    (total, trade) =>
      new Decimal(trade.realizedPnl).lt(0)
        ? total.plus(new Decimal(trade.realizedPnl).abs())
        : total,
    new Decimal(0),
  );
  const profitFactor = grossLoss.gt(0)
    ? grossProfit.div(grossLoss).toFixed(2)
    : "N/A";
  const orderValue = decimalOrZero(amount);

  function setQuickAmount(value: number) {
    setAmount(
      new Decimal(currentState.account.balance)
        .mul(value)
        .div(100)
        .toDecimalPlaces(2)
        .toFixed(2),
    );
  }

  async function executeOrder(side: Side) {
    if (
      !canTrade ||
      !new Decimal(amount || 0).gt(0) ||
      !new Decimal(mark).gt(0)
    )
      return;
    setBusy(true);
    setMessage("");
    const quantity = new Decimal(amount)
      .div(mark)
      .toDecimalPlaces(12)
      .toFixed(12);
    const response = await fetch("/api/trading/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: currentState.account.id,
        instrumentId: currentInstrument.id,
        idempotencyKey: crypto.randomUUID(),
        type: orderKind,
        side,
        quantity,
        leverage,
        ...(orderKind !== "MARKET" ? { limitPrice } : {}),
        ...(orderKind === "STOP_LIMIT" ? { stopPrice } : {}),
      }),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const apiMessage =
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "object" &&
        payload.error !== null &&
        "message" in payload.error &&
        typeof payload.error.message === "string"
          ? payload.error.message
          : "Ордер отклонён.";
      setMessage(apiMessage);
    } else {
      setMessage(
        orderKind === "MARKET"
          ? `${side} позиция открыта.`
          : "Ордер принят сервером.",
      );
      await loadState();
    }
    setBusy(false);
    setConfirmation(null);
  }

  async function closePosition(position: TerminalState["positions"][number]) {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/trading/positions/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: currentState.account.id,
        instrumentId: position.instrumentId,
        positionId: position.id,
        quantity: position.quantity,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    setMessage(
      response.ok ? "Позиция закрыта." : "Не удалось закрыть позицию.",
    );
    if (response.ok) await loadState();
    setBusy(false);
  }

  async function cancelOrder(orderId: string) {
    setBusy(true);
    const response = await fetch("/api/trading/orders", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: currentState.account.id, orderId }),
    });
    setMessage(response.ok ? "Ордер отменён." : "Не удалось отменить ордер.");
    if (response.ok) await loadState();
    setBusy(false);
  }

  return (
    <div className="fusion-app">
      <a className="fusion-skip" href="#trade-workspace">
        К торговому терминалу
      </a>
      <header className="fusion-topbar">
        <div className="fusion-brand">
          <span className="fusion-brand-mark">A</span>
          <span>
            <strong>AXIOM</strong>
            <small>PROP TERMINAL</small>
          </span>
        </div>
        <div className="fusion-pair">
          <strong>{instrument.symbol.replace("/", "")}</strong>
          <span>★</span>
        </div>
        <strong className="fusion-live-price">
          {connection === "DEMO" ? "SIM" : connection}{" "}
          {new Decimal(mark).gt(0) ? money(mark) : "—"}
        </strong>
        <span className="fusion-demo-badge">
          {connection === "DEMO" ? "DEMO DATA" : connection}
        </span>
        <div className="fusion-top-meta">
          <span>
            Data source<strong>{instrument.source}</strong>
          </span>
          <span>
            Confidence<strong>{tick?.confidence ?? "N/A"}</strong>
          </span>
          <span>
            Market<strong>{tick?.status ?? "N/A"}</strong>
          </span>
          <span>
            Funding<strong>N/A</strong>
          </span>
        </div>
        <div className="fusion-account-meta">
          <span>
            Balance<strong>{money(state.account.balance)}</strong>
          </span>
          <span>
            Equity<strong>{money(state.account.equity)}</strong>
          </span>
          <span>
            PnL
            <strong className={profit.gte(0) ? "green" : "red"}>
              {money(profit.toString(), true)}
            </strong>
          </span>
        </div>
        <div className="fusion-profile">
          <span>{state.user.displayName.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{state.user.displayName}</strong>
            <small>{state.challenge?.status ?? state.account.status}</small>
          </div>
        </div>
      </header>

      <main className="fusion-terminal">
        <nav className="fusion-rail" aria-label="Разделы терминала">
          <span className="active" title="Торговля">
            ▦
          </span>
          <span title="Аналитика">⌁</span>
          <span title="Журнал">▤</span>
          <span title="Риск">◇</span>
          <i />
          <span title="Настройки">⚙</span>
        </nav>
        <aside className="fusion-leftbar" aria-label="Прогресс и рынки">
          <section>
            <div className="fusion-section-title">
              <h2>Challenge progress</h2>
              <span>{state.challenge?.status ?? "—"}</span>
            </div>
            <p className="fusion-target">
              Profit Target
              <br />
              <strong>{money(profit.toString(), true)}</strong> /{" "}
              {money(targetMoney.toString())}
            </p>
            <div className="fusion-bar">
              <span style={{ width: `${progress.toFixed(2)}%` }} />
            </div>
            <div className="fusion-bar-row">
              <span>Progress</span>
              <strong>{progress.toFixed(2)}%</strong>
            </div>
            <div className="fusion-rule-row">
              <span>Max Daily Loss</span>
              <strong>
                {percent(state.risk.dailyDrawdownPct)} /{" "}
                {rules ? percent(rules.maxDailyLossPct) : "—"}
              </strong>
            </div>
            <div className="fusion-rule-row">
              <span>Max Overall Loss</span>
              <strong>
                {percent(state.risk.overallDrawdownPct)} /{" "}
                {rules ? percent(rules.maxOverallLossPct) : "—"}
              </strong>
            </div>
          </section>
          <section>
            <div className="fusion-section-title">
              <h2>Statistics</h2>
            </div>
            <dl className="fusion-stats">
              <div>
                <dt>Total PnL</dt>
                <dd className={profit.gte(0) ? "green" : "red"}>
                  {money(profit.toString(), true)}
                </dd>
              </div>
              <div>
                <dt>Win Rate</dt>
                <dd>{winRate}%</dd>
              </div>
              <div>
                <dt>Total Trades</dt>
                <dd>{completedTrades.length}</dd>
              </div>
              <div>
                <dt>Best Trade</dt>
                <dd className="green">{money(bestTrade.toString(), true)}</dd>
              </div>
              <div>
                <dt>Worst Trade</dt>
                <dd className="red">{money(worstTrade.toString(), true)}</dd>
              </div>
              <div>
                <dt>Profit Factor</dt>
                <dd>{profitFactor}</dd>
              </div>
            </dl>
          </section>
          <section>
            <div className="fusion-section-title">
              <h2>Markets</h2>
              <span>{state.instruments.length}</span>
            </div>
            <div className="fusion-watchlist">
              {state.instruments.map((item) => (
                <button
                  key={item.id}
                  aria-pressed={item.id === instrument.id}
                  onClick={() => setSelectedInstrumentId(item.id)}
                >
                  <span>
                    <strong>{item.symbol.replace("/", "")}</strong>
                    <small>{item.displayName}</small>
                  </span>
                  <em>{item.source}</em>
                </button>
              ))}
            </div>
          </section>
          <section>
            <div className="fusion-section-title">
              <h2>Risk score</h2>
            </div>
            <p className="fusion-risk-number">
              {riskScore}
              <small> / 100</small>
            </p>
            <div className="fusion-bar">
              <span style={{ width: `${riskScore}%` }} />
            </div>
            <div className="fusion-bar-row">
              <span>Exposure</span>
              <strong>{exposure.toFixed(2)}%</strong>
            </div>
          </section>
        </aside>

        <section
          className="fusion-workspace"
          id="trade-workspace"
          aria-label="Торговый терминал"
        >
          <div className="fusion-chart-zone" ref={chartZone}>
            <div className="fusion-chart-head">
              <button
                className="fusion-fullscreen"
                onClick={() => void chartZone.current?.requestFullscreen()}
              >
                Fullscreen
              </button>
            </div>
            <TradingViewWidget symbol={instrument.symbol} timeframe="15m" />
          </div>

          <section
            className="fusion-order-desk"
            aria-label="Открытие виртуальной позиции"
          >
            <div
              className="fusion-order-tabs"
              role="tablist"
              aria-label="Order type"
            >
              {(["MARKET", "LIMIT", "STOP_LIMIT"] as const).map((type) => (
                <button
                  key={type}
                  role="tab"
                  aria-selected={orderKind === type}
                  onClick={() => setOrderKind(type)}
                >
                  {type.replace("_", " ")}
                </button>
              ))}
            </div>
            <div className="fusion-order-fields">
              {orderKind !== "MARKET" && (
                <label>
                  Price (USDT)
                  <input
                    aria-label="Limit price"
                    inputMode="decimal"
                    value={limitPrice}
                    onChange={(event) => setLimitPrice(event.target.value)}
                  />
                </label>
              )}
              <label>
                Amount (USD)
                <input
                  aria-label="Размер позиции в USD"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <label>
                Leverage
                <select
                  aria-label="Leverage"
                  value={leverage}
                  onChange={(event) => setLeverage(event.target.value)}
                >
                  {["1", "2", "5", "10"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              {orderKind === "STOP_LIMIT" && (
                <label>
                  Stop price
                  <input
                    aria-label="Stop price"
                    inputMode="decimal"
                    value={stopPrice}
                    onChange={(event) => setStopPrice(event.target.value)}
                  />
                </label>
              )}
            </div>
            <div className="fusion-percent-row" aria-label="Quick size">
              {[10, 25, 50, 75, 100].map((value) => (
                <button key={value} onClick={() => setQuickAmount(value)}>
                  {value}%
                </button>
              ))}
            </div>
            <dl className="fusion-order-summary">
              <div>
                <dt>Order Value</dt>
                <dd>{money(orderValue.toString())}</dd>
              </div>
              <div>
                <dt>Available</dt>
                <dd>{money(state.account.balance)}</dd>
              </div>
              <div>
                <dt>Expected mark</dt>
                <dd>{new Decimal(mark).gt(0) ? money(mark) : "N/A"}</dd>
              </div>
            </dl>
            <div className="fusion-order-grid">
              <article className="fusion-order-card long">
                <div>
                  <strong>Buy / Long</strong>
                  <span>{leverage}×</span>
                </div>
                <dl>
                  <div>
                    <dt>Expected mark</dt>
                    <dd>{new Decimal(mark).gt(0) ? money(mark) : "N/A"}</dd>
                  </div>
                  <div>
                    <dt>Execution</dt>
                    <dd>Simulated</dd>
                  </div>
                </dl>
                <button
                  aria-label="Open Long"
                  disabled={!canTrade || busy}
                  onClick={() => setConfirmation("LONG")}
                >
                  <strong>Long</strong>
                  <small>Demo Trading</small>
                </button>
              </article>
              <article className="fusion-order-card short">
                <div>
                  <strong>Sell / Short</strong>
                  <span>{leverage}×</span>
                </div>
                <dl>
                  <div>
                    <dt>Expected mark</dt>
                    <dd>{new Decimal(mark).gt(0) ? money(mark) : "N/A"}</dd>
                  </div>
                  <div>
                    <dt>Execution</dt>
                    <dd>Simulated</dd>
                  </div>
                </dl>
                <button
                  aria-label="Open Short"
                  disabled={!canTrade || busy}
                  onClick={() => setConfirmation("SHORT")}
                >
                  <strong>Short</strong>
                  <small>Demo Trading</small>
                </button>
              </article>
            </div>
            <p
              className={`fusion-message ${message.includes("отклон") || message.includes("Не удалось") ? "error" : ""}`}
              role="status"
            >
              {message ||
                (canTrade
                  ? "Server-authoritative simulated execution"
                  : `Execution unavailable: ${connection}`)}
            </p>
          </section>
        </section>

        <aside className="fusion-rightbar" aria-label="Позиции и риск">
          <section className="fusion-right-card fusion-activity">
            <div className="fusion-position-tabs" role="tablist">
              {(["POSITIONS", "ORDERS", "HISTORY", "RISK"] as const).map(
                (item) => (
                  <button
                    key={item}
                    role="tab"
                    aria-selected={activity === item}
                    onClick={() => setActivity(item)}
                  >
                    {item[0]}
                    {item.slice(1).toLowerCase()}{" "}
                    {item === "POSITIONS" ? positions.length : ""}
                  </button>
                ),
              )}
            </div>
            {activity === "POSITIONS" &&
              (selectedPositions.length ? (
                selectedPositions.map((position) => (
                  <article className="fusion-position" key={position.id}>
                    <div>
                      <strong>{position.symbol}</strong>
                      <span className={position.side.toLowerCase()}>
                        {position.side} {position.leverage}×
                      </span>
                    </div>
                    <dl>
                      <div>
                        <dt>Unrealized PnL</dt>
                        <dd
                          className={
                            new Decimal(position.unrealizedPnl).gte(0)
                              ? "green"
                              : "red"
                          }
                        >
                          {money(position.unrealizedPnl, true)}
                        </dd>
                      </div>
                      <div>
                        <dt>Quantity</dt>
                        <dd>{new Decimal(position.quantity).toFixed(6)}</dd>
                      </div>
                      <div>
                        <dt>Entry</dt>
                        <dd>{money(position.entryPrice)}</dd>
                      </div>
                      <div>
                        <dt>Mark</dt>
                        <dd>{money(mark)}</dd>
                      </div>
                    </dl>
                    <button
                      disabled={busy}
                      onClick={() => void closePosition(position)}
                    >
                      Close position
                    </button>
                  </article>
                ))
              ) : (
                <div className="fusion-empty">
                  No open positions for {instrument.symbol}.<br />
                  Use Long or Short below the chart.
                </div>
              ))}
            {activity === "ORDERS" &&
              (state.orders.length ? (
                state.orders.map((order) => (
                  <article className="fusion-list-row" key={order.id}>
                    <span>
                      <strong>
                        {order.symbol} {order.side}
                      </strong>
                      <small>
                        {order.type} · {order.status}
                      </small>
                    </span>
                    <button
                      disabled={busy}
                      onClick={() => void cancelOrder(order.id)}
                    >
                      Cancel
                    </button>
                  </article>
                ))
              ) : (
                <div className="fusion-empty">No working orders.</div>
              ))}
            {activity === "HISTORY" &&
              (state.trades.length ? (
                state.trades.map((trade) => (
                  <article className="fusion-list-row" key={trade.id}>
                    <span>
                      <strong>
                        {trade.symbol} {trade.action}
                      </strong>
                      <small>
                        {trade.side} ·{" "}
                        {new Date(trade.openedAt).toLocaleString()}
                      </small>
                    </span>
                    <em
                      className={
                        new Decimal(trade.realizedPnl).gte(0) ? "green" : "red"
                      }
                    >
                      {money(trade.realizedPnl, true)}
                    </em>
                  </article>
                ))
              ) : (
                <div className="fusion-empty">No trade history.</div>
              ))}
            {activity === "RISK" && (
              <div className="fusion-risk-list">
                <p>
                  Daily drawdown{" "}
                  <strong>
                    {percent(state.risk.dailyDrawdownPct)} /{" "}
                    {rules ? percent(rules.maxDailyLossPct) : "—"}
                  </strong>
                </p>
                <p>
                  Overall drawdown{" "}
                  <strong>
                    {percent(state.risk.overallDrawdownPct)} /{" "}
                    {rules ? percent(rules.maxOverallLossPct) : "—"}
                  </strong>
                </p>
                {state.challenge?.violations.map((violation) => (
                  <div className="fusion-violation" key={violation.id}>
                    {violation.message}
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="fusion-right-card">
            <div className="fusion-drawdown-head">
              <h3>Daily Drawdown</h3>
              <strong>
                {percent(state.risk.dailyDrawdownPct)} /{" "}
                {rules ? percent(rules.maxDailyLossPct) : "—"}
              </strong>
            </div>
            <div className="fusion-drawdown">
              <span
                style={{
                  width: `${rules ? Decimal.min(new Decimal(state.risk.dailyDrawdownPct).div(rules.maxDailyLossPct).mul(100), 100).toFixed(2) : "0"}%`,
                }}
              />
            </div>
            <div className="fusion-bar-row">
              <span>Overall</span>
              <strong>{percent(state.risk.overallDrawdownPct)}</strong>
            </div>
          </section>
          <section className="fusion-right-card fusion-coach">
            <div className="fusion-section-title">
              <h2>Risk Coach</h2>
              <span>SERVER</span>
            </div>
            <div className="fusion-coach-score">
              <span>Account score</span>
              <strong>
                {riskScore}
                <small>/100</small>
              </strong>
              <div className="fusion-sparkline" />
            </div>
            <dl className="fusion-coach-metrics">
              <div>
                <dt>Risk</dt>
                <dd>{riskBlocked ? "Blocked" : "Controlled"}</dd>
              </div>
              <div>
                <dt>Reward / Risk</dt>
                <dd>{profitFactor}</dd>
              </div>
              <div>
                <dt>Win Probability</dt>
                <dd>{winRate}%</dd>
              </div>
            </dl>
            <p className="fusion-coach-note">
              {riskBlocked
                ? state.challenge?.violations[0]?.message
                : positions.length
                  ? `Open positions: ${positions.length}. Current exposure ${exposure.toFixed(2)}%.`
                  : "No open exposure. Server risk limits allow a simulated trade."}
            </p>
            <small>Rules are calculated by the Axiom server.</small>
          </section>
        </aside>
      </main>
      <footer className="fusion-footer">
        <span>
          System <strong>● Simulation operational</strong>
        </span>
        <span>{connection} market feed</span>
        <span>Real orders and fund transfers are disabled</span>
      </footer>

      {confirmation && (
        <div className="fusion-modal-backdrop" role="presentation">
          <div
            className="fusion-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <p className="micro-label">Final confirmation</p>
            <h2 id="confirm-title">Confirm {confirmation}</h2>
            <dl>
              <div>
                <dt>Instrument</dt>
                <dd>{instrument.symbol}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>{money(amount)}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{orderKind.replace("_", " ")}</dd>
              </div>
              <div>
                <dt>Leverage</dt>
                <dd>{leverage}×</dd>
              </div>
            </dl>
            <p>
              This is a simulated order. No exchange order or real-money
              transaction will occur.
            </p>
            <div>
              <button
                className="secondary"
                onClick={() => setConfirmation(null)}
              >
                Cancel
              </button>
              <button
                className={
                  confirmation === "LONG" ? "confirm-long" : "confirm-short"
                }
                disabled={busy}
                onClick={() => void executeOrder(confirmation)}
              >
                {busy ? "Submitting…" : `Confirm ${confirmation}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
