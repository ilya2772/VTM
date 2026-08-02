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

import { chartResolutions } from "@/shared/chart";
import { calculateRiskScore } from "@/shared/risk-score";

import { AssetSelector } from "./components/asset-selector";
import { TradingViewWidget } from "./components/tradingview-widget";
import {
  ProductWorkspaces,
  productWorkspaces,
  type ProductWorkspace,
} from "./product-workspaces";
import type { OrderPreview, StreamTick, TerminalState } from "./types";

const timeframes = chartResolutions;
type OrderKind = "MARKET" | "LIMIT" | "STOP_LIMIT";
type Side = "LONG" | "SHORT";
type Activity = "POSITIONS" | "ORDERS" | "HISTORY" | "RISK";
type SizeUnit = "USD" | "ASSET";

interface OrderConfirmation {
  side: Side;
  idempotencyKey: string;
}

interface PositionEditor {
  positionId: string;
  stopLoss: string;
  takeProfit: string;
}

function money(value: string, signed = false) {
  const amount = new Decimal(value);
  const prefix = signed && amount.gt(0) ? "+" : "";
  return `${prefix}${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount.toNumber())}`;
}

function percent(value: string) {
  return `${new Decimal(value).toFixed(2)}%`;
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

function isPositiveInput(value: string): boolean {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return false;
  try {
    return new Decimal(value).gt(0);
  } catch {
    return false;
  }
}

function isOrderPreview(value: unknown): value is OrderPreview {
  return (
    typeof value === "object" &&
    value !== null &&
    "quantity" in value &&
    "expectedExecutionPrice" in value &&
    "fee" in value &&
    "orderStatus" in value &&
    typeof value.quantity === "string" &&
    typeof value.expectedExecutionPrice === "string" &&
    typeof value.fee === "string" &&
    (value.orderStatus === "FILLED" || value.orderStatus === "OPEN")
  );
}

function responseError(payload: unknown, fallback: string): string {
  return typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
    ? payload.error.message
    : fallback;
}

function livePositionPnl(
  position: TerminalState["positions"][number],
  liveMark: string,
): Decimal {
  const mark = isPositiveInput(liveMark)
    ? new Decimal(liveMark)
    : new Decimal(position.markPrice);
  const move =
    position.side === "LONG"
      ? mark.minus(position.entryPrice)
      : new Decimal(position.entryPrice).minus(mark);
  return move.mul(position.quantity).toDecimalPlaces(8);
}

function livePositionPnlPct(
  position: TerminalState["positions"][number],
  pnl: Decimal,
): Decimal {
  const margin = new Decimal(position.quantity)
    .mul(position.entryPrice)
    .div(position.leverage);
  return margin.gt(0)
    ? pnl.div(margin).mul(100).toDecimalPlaces(4)
    : new Decimal(0);
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
  const [workspace, setWorkspace] = useState<ProductWorkspace>("Trade");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [tick, setTick] = useState<StreamTick | null>(null);
  const [connection, setConnection] =
    useState<StreamTick["connection"]>("RECONNECTING");
  const [timeframe, setTimeframe] =
    useState<(typeof timeframes)[number]>("15m");
  const [orderKind, setOrderKind] = useState<OrderKind>("MARKET");
  const [amount, setAmount] = useState("1000");
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>("USD");
  const [leverage, setLeverage] = useState("1");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [previews, setPreviews] = useState<Partial<Record<Side, OrderPreview>>>(
    {},
  );
  const [previewStatus, setPreviewStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [previewErrors, setPreviewErrors] = useState<
    Partial<Record<Side, string>>
  >({});
  const [activity, setActivity] = useState<Activity>("POSITIONS");
  const [positionEditor, setPositionEditor] = useState<PositionEditor | null>(
    null,
  );
  const [closeQuantities, setCloseQuantities] = useState<
    Record<string, string>
  >({});
  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const chartZone = useRef<HTMLDivElement>(null);
  const paymentHandled = useRef(false);

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
    setSelectedInstrumentId((current) => {
      let saved = "";
      try {
        saved =
          window.localStorage?.getItem("axiom.selectedInstrumentId") ?? "";
      } catch {
        // Persisted selection is optional in restricted browser contexts.
      }
      return (
        current ||
        next.instruments.find((item) => item.id === saved)?.id ||
        next.instruments.find(
          (item) => item.symbol === next.chartLayout?.symbol,
        )?.id ||
        next.instruments[0]?.id ||
        ""
      );
    });
    if (next.chartLayout) {
      if (timeframes.some((item) => item === next.chartLayout?.timeframe))
        setTimeframe(next.chartLayout.timeframe as (typeof timeframes)[number]);
      setTheme(next.chartLayout.theme);
      document.documentElement.dataset.theme = next.chartLayout.theme;
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadState(), 0);
    return () => window.clearTimeout(timer);
  }, [loadState]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!state || paymentHandled.current) return;
      const params = new URLSearchParams(window.location.search);
      const payment = params.get("payment");
      if (!payment) return;
      paymentHandled.current = true;
      if (payment === "cancelled") {
        setMessage("Checkout was cancelled; no challenge was created.");
        setWorkspace("Challenges");
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }
      const sessionId = params.get("session_id");
      const finish = async () => {
        if (sessionId?.startsWith("mock_")) {
          const response = await fetch("/api/payments/mock-confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          });
          setMessage(
            response.ok
              ? "Test payment confirmed. Your challenge is ready."
              : "Test payment confirmation failed.",
          );
        } else {
          setMessage(
            "Payment returned successfully. The challenge appears after Stripe webhook confirmation.",
          );
        }
        await loadState();
        setWorkspace("Profile");
        window.history.replaceState({}, "", window.location.pathname);
      };
      void finish();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadState, state]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage?.getItem("axiom.chart.timeframe");
        const saved = timeframes.find((item) => item === stored);
        if (saved) setTimeframe(saved);
      } catch {
        // Storage is optional in privacy-restricted browser contexts.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    try {
      window.localStorage?.setItem("axiom.chart.timeframe", timeframe);
    } catch {
      // Keep the in-memory selection when storage is unavailable.
    }
  }, [timeframe]);
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
  const selectInstrument = useCallback((instrumentId: string) => {
    setSelectedInstrumentId(instrumentId);
    setTick(null);
    setConnection("RECONNECTING");
    try {
      window.localStorage?.setItem("axiom.selectedInstrumentId", instrumentId);
    } catch {
      // Keep the selection in memory when storage is unavailable.
    }
  }, []);
  useEffect(() => {
    if (!instrument) return;
    let lastTickReceivedAt = 0;
    const events = new EventSource(
      `/api/market/stream?symbol=${encodeURIComponent(instrument.symbol)}`,
    );
    events.addEventListener("tick", (event) => {
      try {
        const parsed: unknown = JSON.parse(
          (event as MessageEvent<string>).data,
        );
        if (isStreamTick(parsed)) {
          lastTickReceivedAt = Date.now();
          setTick(parsed);
          setConnection(parsed.connection);
        }
      } catch {
        setConnection("ERROR");
      }
    });
    events.onerror = () => setConnection("RECONNECTING");
    const staleTimer = window.setInterval(() => {
      if (lastTickReceivedAt && Date.now() - lastTickReceivedAt > 5_000)
        setConnection("STALE");
    }, 1_000);
    return () => {
      window.clearInterval(staleTimer);
      events.close();
    };
  }, [instrument]);

  const activeConnection =
    instrument && tick?.symbol === instrument.symbol
      ? connection
      : "RECONNECTING";

  const orderFieldsValid =
    isPositiveInput(amount) &&
    isPositiveInput(leverage) &&
    (orderKind === "MARKET" || isPositiveInput(limitPrice)) &&
    (orderKind !== "STOP_LIMIT" || isPositiveInput(stopPrice)) &&
    (!stopLoss || isPositiveInput(stopLoss)) &&
    (!takeProfit || isPositiveInput(takeProfit));
  const previewAllowed =
    Boolean(state && instrument) &&
    state?.account.status === "ACTIVE" &&
    state.challenge?.status === "ACTIVE" &&
    !state.challenge.violations.some((violation) => violation.blocksTrading) &&
    (activeConnection === "DEMO" || activeConnection === "LIVE") &&
    orderFieldsValid;
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      if (!previewAllowed || !state || !instrument) {
        setPreviews({});
        setPreviewErrors({});
        setPreviewStatus("idle");
        return;
      }
      setPreviewStatus("loading");
      setPreviewErrors({});
      const requestPreview = async (side: Side) => {
        const response = await fetch("/api/trading/orders/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: state.account.id,
            instrumentId: instrument.id,
            type: orderKind,
            side,
            size: amount,
            sizeUnit,
            leverage,
            ...(orderKind !== "MARKET" ? { limitPrice } : {}),
            ...(orderKind === "STOP_LIMIT" ? { stopPrice } : {}),
            ...(stopLoss ? { stopLoss } : {}),
            ...(takeProfit ? { takeProfit } : {}),
          }),
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(responseError(payload, "Order preview failed."));
        if (!isOrderPreview(payload))
          throw new Error("Order preview response is invalid.");
        return payload;
      };
      void Promise.allSettled([
        requestPreview("LONG"),
        requestPreview("SHORT"),
      ]).then(([longResult, shortResult]) => {
        if (controller.signal.aborted) return;
        const nextPreviews: Partial<Record<Side, OrderPreview>> = {};
        const nextErrors: Partial<Record<Side, string>> = {};
        if (longResult.status === "fulfilled")
          nextPreviews.LONG = longResult.value;
        else nextErrors.LONG = longResult.reason.message;
        if (shortResult.status === "fulfilled")
          nextPreviews.SHORT = shortResult.value;
        else nextErrors.SHORT = shortResult.reason.message;
        setPreviews(nextPreviews);
        setPreviewErrors(nextErrors);
        setPreviewStatus(
          nextPreviews.LONG || nextPreviews.SHORT ? "ready" : "error",
        );
      });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    amount,
    activeConnection,
    instrument,
    leverage,
    limitPrice,
    orderKind,
    previewAllowed,
    sizeUnit,
    state,
    stopLoss,
    stopPrice,
    takeProfit,
  ]);

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

  const mark = tick?.symbol === instrument.symbol ? tick.price : "0";
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
    (activeConnection === "DEMO" || activeConnection === "LIVE") &&
    new Decimal(mark).gt(0);
  const positions = state.positions;
  const selectedPositions = positions.filter(
    (position) => position.instrumentId === instrument.id,
  );
  const selectedOrders = state.orders.filter(
    (order) => order.symbol === instrument.symbol,
  );
  const selectedTrades = state.trades.filter(
    (trade) => trade.symbol === instrument.symbol,
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
  const currentNotional = positions.reduce(
    (sum, position) =>
      sum.plus(new Decimal(position.quantity).mul(position.markPrice)),
    new Decimal(0),
  );
  const selectedNotional = selectedPositions.reduce(
    (sum, position) =>
      sum.plus(new Decimal(position.quantity).mul(position.markPrice)),
    new Decimal(0),
  );
  const requestedNotional =
    sizeUnit === "USD" && isPositiveInput(amount)
      ? new Decimal(amount)
      : isPositiveInput(amount) && isPositiveInput(mark)
        ? new Decimal(amount).mul(mark)
        : new Decimal(0);
  const previewRisk = previews.LONG?.risk ?? previews.SHORT?.risk;
  const riskResult =
    previewRisk ??
    calculateRiskScore({
      balance: state.account.balance,
      equity: state.account.equity,
      totalExposure: currentNotional.plus(requestedNotional).toString(),
      selectedAssetExposure: selectedNotional
        .plus(requestedNotional)
        .toString(),
      leverage: isPositiveInput(leverage) ? leverage : "1",
      maxLeverage: rules?.maxLeverage ?? "1",
      orderNotional: requestedNotional.toString(),
      potentialLoss: null,
      hasStopLoss: Boolean(stopLoss),
      dailyDrawdownPct: state.risk.dailyDrawdownPct,
      maxDailyDrawdownPct: rules?.maxDailyLossPct ?? "0",
      overallDrawdownPct: state.risk.overallDrawdownPct,
      maxOverallDrawdownPct: rules?.maxOverallLossPct ?? "0",
      correlatedPositions: selectedPositions.length,
      blockingViolations:
        state.challenge?.violations
          .filter((item) => item.blocksTrading)
          .map((item) => item.message) ?? [],
    });
  const riskScore = riskResult.score;
  const confirmationPreview = confirmation
    ? previews[confirmation.side]
    : undefined;
  const dailyRiskRemainingPct = rules
    ? Decimal.max(
        new Decimal(rules.maxDailyLossPct).minus(state.risk.dailyDrawdownPct),
        0,
      )
    : null;
  const overallRiskRemainingPct = rules
    ? Decimal.max(
        new Decimal(rules.maxOverallLossPct).minus(
          state.risk.overallDrawdownPct,
        ),
        0,
      )
    : null;
  const dailyRiskRemainingMoney = dailyRiskRemainingPct
    ? new Decimal(state.challenge?.dailyStartingEquity ?? 0)
        .mul(dailyRiskRemainingPct)
        .div(100)
    : null;
  const overallRiskRemainingMoney = overallRiskRemainingPct
    ? new Decimal(state.account.initialBalance)
        .mul(overallRiskRemainingPct)
        .div(100)
    : null;

  function setQuickAmount(value: number) {
    const usdSize = new Decimal(currentState.account.balance)
      .mul(value)
      .div(100);
    if (sizeUnit === "ASSET" && !new Decimal(mark).gt(0)) {
      setMessage("Asset sizing requires a current server price.");
      return;
    }
    setAmount(
      sizeUnit === "USD"
        ? usdSize.toDecimalPlaces(2).toFixed(2)
        : usdSize.div(mark).toDecimalPlaces(12).toFixed(12),
    );
  }

  function openConfirmation(side: Side) {
    if (!previews[side] || !canTrade || busy) return;
    setConfirmation({ side, idempotencyKey: crypto.randomUUID() });
  }

  async function executeOrder(order: OrderConfirmation) {
    const preview = previews[order.side];
    if (!canTrade || !orderFieldsValid || !preview) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/trading/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: currentState.account.id,
        instrumentId: currentInstrument.id,
        idempotencyKey: order.idempotencyKey,
        type: orderKind,
        side: order.side,
        size: amount,
        sizeUnit,
        leverage,
        ...(orderKind !== "MARKET" ? { limitPrice } : {}),
        ...(orderKind === "STOP_LIMIT" ? { stopPrice } : {}),
        ...(stopLoss ? { stopLoss } : {}),
        ...(takeProfit ? { takeProfit } : {}),
      }),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(responseError(payload, "Ордер отклонён."));
    } else {
      setMessage(
        orderKind === "MARKET"
          ? `${order.side} позиция открыта.`
          : preview.orderStatus === "FILLED"
            ? `${order.side} позиция открыта.`
            : "Виртуальный ордер принят сервером.",
      );
      await loadState();
    }
    setBusy(false);
    setConfirmation(null);
  }

  function setClosePercent(
    position: TerminalState["positions"][number],
    percentValue: number,
  ) {
    setCloseQuantities((current) => ({
      ...current,
      [position.id]: new Decimal(position.quantity)
        .mul(percentValue)
        .div(100)
        .toDecimalPlaces(12)
        .toString(),
    }));
  }

  async function closePosition(
    position: TerminalState["positions"][number],
    quantityOverride?: string,
  ) {
    const quantity =
      quantityOverride ?? closeQuantities[position.id] ?? position.quantity;
    if (
      !isPositiveInput(quantity) ||
      new Decimal(quantity).gt(position.quantity)
    ) {
      setMessage(
        "Close quantity must be positive and not exceed the position.",
      );
      return;
    }
    const partial = new Decimal(quantity).lt(position.quantity);
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/trading/positions/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: currentState.account.id,
        instrumentId: position.instrumentId,
        positionId: position.id,
        quantity,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    const payload: unknown = await response.json().catch(() => null);
    setMessage(
      response.ok
        ? partial
          ? "Позиция частично закрыта."
          : "Позиция закрыта."
        : responseError(payload, "Не удалось закрыть позицию."),
    );
    if (response.ok) {
      setCloseQuantities((current) => {
        const next = { ...current };
        delete next[position.id];
        return next;
      });
      await loadState();
    }
    setBusy(false);
  }

  async function savePositionTargets(
    position: TerminalState["positions"][number],
  ) {
    if (!positionEditor || positionEditor.positionId !== position.id) return;
    if (
      (positionEditor.stopLoss && !isPositiveInput(positionEditor.stopLoss)) ||
      (positionEditor.takeProfit && !isPositiveInput(positionEditor.takeProfit))
    ) {
      setMessage("SL and TP must be positive decimal values or empty.");
      return;
    }
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/trading/positions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: currentState.account.id,
        instrumentId: position.instrumentId,
        positionId: position.id,
        stopLoss: positionEditor.stopLoss || null,
        takeProfit: positionEditor.takeProfit || null,
      }),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (response.ok) {
      setMessage("Защитные уровни позиции обновлены.");
      setPositionEditor(null);
      await loadState();
    } else {
      setMessage(responseError(payload, "Не удалось обновить SL/TP."));
    }
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

  async function savePreference(body: object) {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/terminal/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setMessage(
      response.ok ? "Настройки сохранены." : "Не удалось сохранить настройки.",
    );
    if (response.ok) await loadState();
    setBusy(false);
  }

  async function toggleWatchlist(instrumentId: string, enabled: boolean) {
    await savePreference({ kind: "WATCHLIST", instrumentId, enabled });
  }

  async function saveLayout(nextTheme: "dark" | "light") {
    if (!instrument) return;
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    await savePreference({
      kind: "CHART_LAYOUT",
      symbol: instrument.symbol,
      timeframe,
      chartType: "Candles",
      theme: nextTheme,
    });
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
        <AssetSelector
          instrument={instrument}
          instruments={state.instruments}
          favoriteIds={state.watchlistInstrumentIds}
          onSelect={selectInstrument}
          onToggleFavorite={toggleWatchlist}
        />
        <strong className="fusion-live-price">
          {(activeConnection === "LIVE" || activeConnection === "DEMO") &&
          new Decimal(mark).gt(0)
            ? money(mark)
            : activeConnection === "STALE"
              ? "STALE"
              : "Unavailable"}
        </strong>
        {activeConnection !== "LIVE" && (
          <span
            className={`fusion-feed-state ${activeConnection.toLowerCase()}`}
          >
            {activeConnection}
          </span>
        )}
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

      <nav className="fusion-primary-nav" aria-label="Primary navigation">
        {productWorkspaces.map((item) => (
          <button
            key={item}
            aria-current={workspace === item ? "page" : undefined}
            className={workspace === item ? "active" : ""}
            onClick={() => setWorkspace(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      <main className="fusion-terminal">
        <aside
          hidden={workspace !== "Trade"}
          className="fusion-leftbar"
          aria-label="Прогресс и рынки"
        >
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
                <dt>Open positions</dt>
                <dd>{positions.length}</dd>
              </div>
              <div>
                <dt>Used margin</dt>
                <dd>{money(usedMargin.toString())}</dd>
              </div>
              <div>
                <dt>Trading days</dt>
                <dd>
                  {state.challenge?.tradingDays ?? 0} /{" "}
                  {rules?.minTradingDays ?? "—"}
                </dd>
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
                  onClick={() => selectInstrument(item.id)}
                >
                  <span>
                    <strong>{item.symbol.replace("/", "")}</strong>
                    <small>{item.displayName}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section>
            <div className="fusion-section-title">
              <h2>Risk score</h2>
              <span>{riskResult.level}</span>
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
            <ul className="fusion-risk-factors">
              {riskResult.factors.slice(0, 3).map((factor) => (
                <li key={factor.code}>{factor.label}</li>
              ))}
            </ul>
          </section>
        </aside>

        <section
          hidden={workspace !== "Trade"}
          className="fusion-workspace"
          id="trade-workspace"
          aria-label="Торговый терминал"
        >
          <div className="fusion-chart-zone" ref={chartZone}>
            <button
              className="fusion-fullscreen fusion-fullscreen-overlay"
              onClick={() => void chartZone.current?.requestFullscreen()}
            >
              Fullscreen
            </button>
            <TradingViewWidget
              symbol={instrument.symbol}
              timeframe={timeframe}
              theme={theme}
            />
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
              <label>
                Size ({sizeUnit === "USD" ? "USD" : instrument.baseAsset})
                <input
                  aria-label="Order size"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <label>
                Unit
                <select
                  aria-label="Size unit"
                  value={sizeUnit}
                  onChange={(event) => {
                    if (event.target.value === "USD") setSizeUnit("USD");
                    if (event.target.value === "ASSET") setSizeUnit("ASSET");
                  }}
                >
                  <option value="USD">USD</option>
                  <option value="ASSET">{instrument.baseAsset}</option>
                </select>
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
              {orderKind !== "MARKET" && (
                <label>
                  Limit price
                  <input
                    aria-label="Limit price"
                    inputMode="decimal"
                    value={limitPrice}
                    onChange={(event) => setLimitPrice(event.target.value)}
                  />
                </label>
              )}
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
              <label>
                Stop Loss
                <input
                  aria-label="Stop Loss"
                  inputMode="decimal"
                  placeholder="Optional"
                  value={stopLoss}
                  onChange={(event) => setStopLoss(event.target.value)}
                />
              </label>
              <label>
                Take Profit
                <input
                  aria-label="Take Profit"
                  inputMode="decimal"
                  placeholder="Optional"
                  value={takeProfit}
                  onChange={(event) => setTakeProfit(event.target.value)}
                />
              </label>
            </div>
            <div className="fusion-percent-row" aria-label="Quick size">
              {[10, 25, 50, 75, 100].map((value) => (
                <button key={value} onClick={() => setQuickAmount(value)}>
                  {value}%
                </button>
              ))}
            </div>
            <div className="fusion-order-grid">
              <article className="fusion-order-card long">
                <div>
                  <strong>Buy / Long</strong>
                  <span>{leverage}×</span>
                </div>
                <dl>
                  <div>
                    <dt>Expected execution</dt>
                    <dd>
                      {previews.LONG
                        ? money(previews.LONG.expectedExecutionPrice)
                        : "N/A"}
                    </dd>
                  </div>
                  <div>
                    <dt>Fee / margin</dt>
                    <dd>
                      {previews.LONG
                        ? `${money(previews.LONG.fee)} / ${money(previews.LONG.initialMargin)}`
                        : "N/A"}
                    </dd>
                  </div>
                </dl>
                <button
                  disabled={!canTrade || busy || !previews.LONG}
                  onClick={() => openConfirmation("LONG")}
                >
                  {previewStatus === "loading" ? "Calculating…" : "Open Long"}
                </button>
                {previewErrors.LONG && (
                  <small className="fusion-preview-error">
                    {previewErrors.LONG}
                  </small>
                )}
              </article>
              <article className="fusion-score-card">
                <span>Risk Score</span>
                <strong>
                  {riskScore}
                  <small>/100</small>
                </strong>
                <div className="fusion-sparkline" />
                <p>
                  {riskBlocked
                    ? "Trading blocked by risk rules"
                    : `Exposure ${exposure.toFixed(2)}%`}
                </p>
              </article>
              <article className="fusion-order-card short">
                <div>
                  <strong>Sell / Short</strong>
                  <span>{leverage}×</span>
                </div>
                <dl>
                  <div>
                    <dt>Expected execution</dt>
                    <dd>
                      {previews.SHORT
                        ? money(previews.SHORT.expectedExecutionPrice)
                        : "N/A"}
                    </dd>
                  </div>
                  <div>
                    <dt>Fee / margin</dt>
                    <dd>
                      {previews.SHORT
                        ? `${money(previews.SHORT.fee)} / ${money(previews.SHORT.initialMargin)}`
                        : "N/A"}
                    </dd>
                  </div>
                </dl>
                <button
                  disabled={!canTrade || busy || !previews.SHORT}
                  onClick={() => openConfirmation("SHORT")}
                >
                  {previewStatus === "loading" ? "Calculating…" : "Open Short"}
                </button>
                {previewErrors.SHORT && (
                  <small className="fusion-preview-error">
                    {previewErrors.SHORT}
                  </small>
                )}
              </article>
            </div>
            <p
              className={`fusion-message ${message.includes("отклон") || message.includes("Не удалось") ? "error" : ""}`}
              role="status"
            >
              {message ||
                (canTrade
                  ? "Server-authoritative simulated execution"
                  : `Execution unavailable: ${activeConnection}`)}
            </p>
          </section>
        </section>

        <aside
          hidden={workspace !== "Trade"}
          className="fusion-rightbar"
          aria-label="Позиции и риск"
        >
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
                    {item === "POSITIONS" ? selectedPositions.length : ""}
                  </button>
                ),
              )}
            </div>
            {activity === "POSITIONS" &&
              (selectedPositions.length ? (
                selectedPositions.map((position) => {
                  const liveMarkAvailable =
                    position.markAvailable &&
                    (activeConnection === "LIVE" ||
                      activeConnection === "DEMO") &&
                    isPositiveInput(mark);
                  const livePnl = liveMarkAvailable
                    ? livePositionPnl(position, mark)
                    : null;
                  const livePnlPct = livePnl
                    ? livePositionPnlPct(position, livePnl)
                    : null;
                  const editing = positionEditor?.positionId === position.id;
                  return (
                    <article
                      className="fusion-position"
                      key={position.id}
                      aria-label={`${position.side} position ${position.symbol}`}
                    >
                      <div>
                        <strong>{position.symbol}</strong>
                        <span className={position.side.toLowerCase()}>
                          {position.side} {position.leverage}×
                        </span>
                      </div>
                      <dl>
                        <div>
                          <dt>Live unrealized PnL</dt>
                          <dd
                            className={
                              livePnl
                                ? livePnl.gte(0)
                                  ? "green"
                                  : "red"
                                : undefined
                            }
                          >
                            {livePnl && livePnlPct
                              ? `${money(livePnl.toString(), true)} · ${livePnlPct.toFixed(2)}%`
                              : "Unavailable"}
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
                          <dt>Live mark</dt>
                          <dd>
                            {liveMarkAvailable ? money(mark) : "Unavailable"}
                          </dd>
                        </div>
                        <div>
                          <dt>Liquidation</dt>
                          <dd>
                            {position.liquidationPrice
                              ? money(position.liquidationPrice)
                              : "N/A"}
                          </dd>
                        </div>
                        <div>
                          <dt>Stop Loss</dt>
                          <dd>
                            {position.stopLoss
                              ? money(position.stopLoss)
                              : "N/A"}
                          </dd>
                        </div>
                        <div>
                          <dt>Take Profit</dt>
                          <dd>
                            {position.takeProfit
                              ? money(position.takeProfit)
                              : "N/A"}
                          </dd>
                        </div>
                        <div>
                          <dt>Source</dt>
                          <dd>
                            {state.marketDataMode === "PYTH"
                              ? "Pyth"
                              : "Server feed"}{" "}
                            ·{" "}
                            {liveMarkAvailable ? "server tick" : "unavailable"}
                          </dd>
                        </div>
                      </dl>
                      <div className="fusion-position-actions">
                        <button
                          disabled={busy}
                          onClick={() =>
                            setPositionEditor(
                              editing
                                ? null
                                : {
                                    positionId: position.id,
                                    stopLoss: position.stopLoss ?? "",
                                    takeProfit: position.takeProfit ?? "",
                                  },
                            )
                          }
                        >
                          {editing ? "Cancel SL/TP edit" : "Edit SL/TP"}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void closePosition(position, position.quantity)
                          }
                        >
                          Close full
                        </button>
                      </div>
                      {editing && positionEditor && (
                        <div className="fusion-position-editor">
                          <label>
                            Stop Loss
                            <input
                              aria-label={`Edit Stop Loss for ${position.side}`}
                              inputMode="decimal"
                              placeholder="N/A"
                              value={positionEditor.stopLoss}
                              onChange={(event) =>
                                setPositionEditor({
                                  ...positionEditor,
                                  stopLoss: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            Take Profit
                            <input
                              aria-label={`Edit Take Profit for ${position.side}`}
                              inputMode="decimal"
                              placeholder="N/A"
                              value={positionEditor.takeProfit}
                              onChange={(event) =>
                                setPositionEditor({
                                  ...positionEditor,
                                  takeProfit: event.target.value,
                                })
                              }
                            />
                          </label>
                          <button
                            disabled={busy}
                            onClick={() => void savePositionTargets(position)}
                          >
                            Save SL/TP
                          </button>
                        </div>
                      )}
                      <div className="fusion-partial-close">
                        <label>
                          Close quantity
                          <input
                            aria-label={`Close quantity for ${position.side}`}
                            inputMode="decimal"
                            value={
                              closeQuantities[position.id] ?? position.quantity
                            }
                            onChange={(event) =>
                              setCloseQuantities((current) => ({
                                ...current,
                                [position.id]: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <div>
                          {[25, 50, 100].map((value) => (
                            <button
                              key={value}
                              disabled={busy}
                              onClick={() => setClosePercent(position, value)}
                            >
                              {value}%
                            </button>
                          ))}
                          <button
                            disabled={busy}
                            onClick={() => void closePosition(position)}
                          >
                            Close quantity
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="fusion-empty">
                  No open positions for {instrument.symbol}.<br />
                  Use Long or Short below the chart.
                </div>
              ))}
            {activity === "ORDERS" &&
              (selectedOrders.length ? (
                selectedOrders.map((order) => (
                  <article className="fusion-list-row" key={order.id}>
                    <span>
                      <strong>
                        {order.symbol} {order.side}
                      </strong>
                      <small>
                        {order.type} · {order.status} · qty {order.quantity}
                        <br />
                        Limit {order.limitPrice ?? "N/A"} · Stop{" "}
                        {order.stopPrice ?? "N/A"}
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
              (selectedTrades.length ? (
                selectedTrades.map((trade) => (
                  <article className="fusion-list-row" key={trade.id}>
                    <span>
                      <strong>
                        {trade.symbol} {trade.action}
                      </strong>
                      <small>
                        {trade.side} · qty {trade.quantity} ·{" "}
                        {new Date(
                          trade.closedAt ?? trade.openedAt,
                        ).toLocaleString()}
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
                  Daily remaining{" "}
                  <strong>
                    {dailyRiskRemainingPct
                      ? `${dailyRiskRemainingPct.toFixed(2)}% · ${money(dailyRiskRemainingMoney?.toString() ?? "0")}`
                      : "N/A"}
                  </strong>
                </p>
                <p>
                  Overall drawdown{" "}
                  <strong>
                    {percent(state.risk.overallDrawdownPct)} /{" "}
                    {rules ? percent(rules.maxOverallLossPct) : "—"}
                  </strong>
                </p>
                <p>
                  Overall remaining{" "}
                  <strong>
                    {overallRiskRemainingPct
                      ? `${overallRiskRemainingPct.toFixed(2)}% · ${money(overallRiskRemainingMoney?.toString() ?? "0")}`
                      : "N/A"}
                  </strong>
                </p>
                {state.challenge?.violations.map((violation) => (
                  <div className="fusion-violation" key={violation.id}>
                    <strong>{violation.type}</strong>
                    <br />
                    {violation.message}
                    <br />
                    {violation.blocksTrading
                      ? "New orders are blocked by the server."
                      : "Informational violation; trading remains available."}
                  </div>
                ))}
                {!state.challenge?.violations.length && (
                  <div className="fusion-risk-ok">
                    No active risk violations. New simulated orders are allowed.
                  </div>
                )}
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
              <span>Daily remaining</span>
              <strong>
                {dailyRiskRemainingPct
                  ? percent(dailyRiskRemainingPct.toString())
                  : "N/A"}
              </strong>
            </div>
            <div className="fusion-bar-row">
              <span>Overall / remaining</span>
              <strong>
                {percent(state.risk.overallDrawdownPct)} /{" "}
                {overallRiskRemainingPct
                  ? percent(overallRiskRemainingPct.toString())
                  : "N/A"}
              </strong>
            </div>
          </section>
          <section className="fusion-right-card fusion-coach">
            <div className="fusion-section-title">
              <h2>AI Coach</h2>
              <span>RULE-BASED</span>
            </div>
            <div>
              <ul className="fusion-coach-list">
                {riskResult.factors.slice(0, 4).map((factor) => (
                  <li
                    className={factor.severity.toLowerCase()}
                    key={factor.code}
                  >
                    <strong>{factor.severity}</strong> {factor.label}.
                  </li>
                ))}
                {!riskResult.factors.length && (
                  <li className="info">
                    <strong>INFO</strong> Current parameters comply with
                    challenge rules.
                  </li>
                )}
              </ul>
            </div>
            <small>
              Risk-management guidance only; not financial advice. Final checks
              run on the Axiom server.
            </small>
          </section>
        </aside>
        {workspace !== "Trade" && (
          <ProductWorkspaces
            workspace={workspace}
            state={state}
            selectedInstrumentId={instrument.id}
            timeframe={timeframe}
            theme={theme}
            busy={busy}
            message={message}
            onSelectInstrument={(id) => {
              selectInstrument(id);
              setWorkspace("Trade");
            }}
            onToggleWatchlist={toggleWatchlist}
            onSaveLayout={saveLayout}
            onStateChanged={loadState}
            onNavigate={setWorkspace}
          />
        )}
      </main>
      <footer className="fusion-footer">
        <span>
          System <strong>● Simulation operational</strong>
        </span>
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
            <h2 id="confirm-title">Confirm {confirmation.side}</h2>
            <dl>
              <div>
                <dt>Instrument</dt>
                <dd>{instrument.symbol}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>
                  {sizeUnit === "USD"
                    ? money(amount)
                    : `${amount} ${instrument.baseAsset}`}
                </dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{orderKind.replace("_", " ")}</dd>
              </div>
              <div>
                <dt>Leverage</dt>
                <dd>{leverage}×</dd>
              </div>
              <div>
                <dt>Asset quantity</dt>
                <dd>{confirmationPreview?.quantity ?? "N/A"}</dd>
              </div>
              <div>
                <dt>Expected execution</dt>
                <dd>
                  {confirmationPreview
                    ? money(confirmationPreview.expectedExecutionPrice)
                    : "N/A"}
                </dd>
              </div>
              <div>
                <dt>Fee / margin</dt>
                <dd>
                  {confirmationPreview
                    ? `${money(confirmationPreview.fee)} / ${money(confirmationPreview.initialMargin)}`
                    : "N/A"}
                </dd>
              </div>
              <div>
                <dt>Liquidation</dt>
                <dd>
                  {confirmationPreview?.liquidationPrice
                    ? money(confirmationPreview.liquidationPrice)
                    : "N/A at 1×"}
                </dd>
              </div>
              <div>
                <dt>Stop Loss / potential</dt>
                <dd>
                  {stopLoss && confirmationPreview?.potentialLoss
                    ? `${money(stopLoss)} / ${money(confirmationPreview.potentialLoss, true)}`
                    : "Not set"}
                </dd>
              </div>
              <div>
                <dt>Take Profit / potential</dt>
                <dd>
                  {takeProfit && confirmationPreview?.potentialProfit
                    ? `${money(takeProfit)} / ${money(confirmationPreview.potentialProfit, true)}`
                    : "Not set"}
                </dd>
              </div>
              <div>
                <dt>Risk / reward</dt>
                <dd>
                  {confirmationPreview?.riskReward
                    ? `1 : ${confirmationPreview.riskReward}`
                    : "N/A"}
                </dd>
              </div>
              <div>
                <dt>Server outcome</dt>
                <dd>{confirmationPreview?.orderStatus ?? "N/A"}</dd>
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
                  confirmation.side === "LONG"
                    ? "confirm-long"
                    : "confirm-short"
                }
                disabled={busy || !confirmationPreview}
                onClick={() => void executeOrder(confirmation)}
              >
                {busy ? "Submitting…" : `Confirm ${confirmation.side}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
