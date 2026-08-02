"use client";

import Decimal from "decimal.js";
import { useCallback, useEffect, useMemo, useState } from "react";

interface ChallengeStoreState {
  paymentMode: "stripe" | "mock";
  activeAccountId: string | null;
  products: {
    id: string;
    slug: string;
    name: string;
    description: string;
    accountSize: string;
    price: string;
    currency: string;
    profitTargetPct: string;
    maxDailyLossPct: string;
    maxOverallLossPct: string;
    minTradingDays: number;
    maxLeverage: string;
    stages: number;
  }[];
  challenges: {
    id: string;
    accountId: string;
    name: string;
    status:
      "PENDING_PAYMENT" | "READY" | "ACTIVE" | "PASSED" | "FAILED" | "EXPIRED";
    accountSize: string;
    balance: string;
    equity: string;
    purchasedAt: string;
    tradingDays: number;
    stages: number;
    rules: null | {
      profitTargetPct: string;
      maxDailyLossPct: string;
      maxOverallLossPct: string;
      minTradingDays: number;
      maxLeverage: string;
    };
  }[];
  payments: {
    id: string;
    productName: string;
    status: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
    amount: string;
    currency: string;
    provider: string;
    paymentId: string | null;
    createdAt: string;
  }[];
}

interface Props {
  workspace: "Challenges" | "Profile";
  user: { email: string; displayName: string };
  onStateChanged(): Promise<void>;
  onNavigate(workspace: "Challenges" | "Profile"): void;
}

const currency = (value: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value));

export function ChallengeWorkspaces(props: Props) {
  const [data, setData] = useState<ChallengeStoreState | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountSize, setAccountSize] = useState("all");
  const [maxPrice, setMaxPrice] = useState("all");
  const [stages, setStages] = useState("all");
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    const response = await fetch("/api/challenges", { cache: "no-store" });
    if (!response.ok) {
      setStatus("error");
      return;
    }
    setData((await response.json()) as ChallengeStoreState);
    setStatus("ready");
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const products = useMemo(
    () =>
      (data?.products ?? []).filter(
        (product) =>
          (accountSize === "all" || product.accountSize === accountSize) &&
          (maxPrice === "all" || new Decimal(product.price).lte(maxPrice)) &&
          (stages === "all" || String(product.stages) === stages),
      ),
    [accountSize, data?.products, maxPrice, stages],
  );
  const detail = data?.products.find((product) => product.id === detailId);

  async function buy(productId: string) {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/payments/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    });
    const payload = (await response.json().catch(() => null)) as null | {
      checkoutUrl?: string;
    };
    if (!response.ok || !payload?.checkoutUrl) {
      setMessage("Checkout could not be created.");
      setBusy(false);
      return;
    }
    window.location.assign(payload.checkoutUrl);
  }

  async function activate(challengeId: string) {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/challenges/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId }),
    });
    setMessage(
      response.ok
        ? "Active challenge updated."
        : "This challenge cannot be activated.",
    );
    if (response.ok) {
      await Promise.all([load(), props.onStateChanged()]);
    }
    setBusy(false);
  }

  if (status === "loading")
    return (
      <div className="product-empty" role="status">
        Loading challenge data…
      </div>
    );
  if (status === "error")
    return (
      <div className="product-empty" role="alert">
        Challenge data is unavailable.{" "}
        <button onClick={() => void load()}>Retry</button>
      </div>
    );
  if (!data) return null;

  if (props.workspace === "Challenges") {
    return (
      <>
        <div className="challenge-filters" aria-label="Challenge filters">
          <label>
            Account size
            <select
              value={accountSize}
              onChange={(event) => setAccountSize(event.target.value)}
            >
              <option value="all">All</option>
              {[...new Set(data.products.map((item) => item.accountSize))].map(
                (value) => (
                  <option key={value} value={value}>
                    {currency(value)}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            Maximum price
            <select
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
            >
              <option value="all">All</option>
              <option value="100">$100</option>
              <option value="300">$300</option>
              <option value="500">$500</option>
            </select>
          </label>
          <label>
            Stages
            <select
              value={stages}
              onChange={(event) => setStages(event.target.value)}
            >
              <option value="all">All</option>
              <option value="1">1 stage</option>
              <option value="2">2 stages</option>
            </select>
          </label>
          <span>
            {data.paymentMode === "mock" ? "Test checkout" : "Stripe test mode"}
          </span>
        </div>
        {detail && (
          <article className="challenge-detail">
            <button onClick={() => setDetailId(null)}>← Back to catalog</button>
            <h2>{detail.name}</h2>
            <p>{detail.description}</p>
            <dl>
              <div>
                <dt>Profit target</dt>
                <dd>{detail.profitTargetPct}%</dd>
              </div>
              <div>
                <dt>Daily / overall drawdown</dt>
                <dd>
                  {detail.maxDailyLossPct}% / {detail.maxOverallLossPct}%
                </dd>
              </div>
              <div>
                <dt>Minimum trading days</dt>
                <dd>{detail.minTradingDays}</dd>
              </div>
              <div>
                <dt>Leverage</dt>
                <dd>Up to {detail.maxLeverage}×</dd>
              </div>
              <div>
                <dt>Stages</dt>
                <dd>{detail.stages}</dd>
              </div>
            </dl>
            <button disabled={busy} onClick={() => void buy(detail.id)}>
              Buy Challenge · {currency(detail.price)}
            </button>
          </article>
        )}
        {!detail &&
          (products.length ? (
            <div className="challenge-grid">
              {products.map((product) => (
                <article key={product.id}>
                  <span>
                    {product.stages} stage{product.stages === 1 ? "" : "s"}
                  </span>
                  <h2>{product.name}</h2>
                  <strong>{currency(product.accountSize)} account</strong>
                  <b>{currency(product.price)}</b>
                  <dl>
                    <div>
                      <dt>Profit target</dt>
                      <dd>{product.profitTargetPct}%</dd>
                    </div>
                    <div>
                      <dt>Daily drawdown</dt>
                      <dd>{product.maxDailyLossPct}%</dd>
                    </div>
                    <div>
                      <dt>Overall drawdown</dt>
                      <dd>{product.maxOverallLossPct}%</dd>
                    </div>
                    <div>
                      <dt>Trading days</dt>
                      <dd>{product.minTradingDays}</dd>
                    </div>
                    <div>
                      <dt>Leverage</dt>
                      <dd>{product.maxLeverage}×</dd>
                    </div>
                  </dl>
                  <div>
                    <button onClick={() => setDetailId(product.id)}>
                      View details
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void buy(product.id)}
                    >
                      Buy
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="product-empty">
              No challenges match these filters.
            </div>
          ))}
        <p role="status">{message}</p>
      </>
    );
  }

  return (
    <div className="profile-layout">
      <section className="profile-summary">
        <span>{props.user.displayName.slice(0, 2).toUpperCase()}</span>
        <div>
          <h2>{props.user.displayName}</h2>
          <p>{props.user.email}</p>
        </div>
        <button onClick={() => props.onNavigate("Challenges")}>
          Buy new challenge
        </button>
      </section>
      <section>
        <h2>Purchased challenges</h2>
        {data.challenges.length ? (
          <div className="product-table">
            {data.challenges.map((challenge) => {
              const target = challenge.rules
                ? new Decimal(challenge.accountSize)
                    .mul(challenge.rules.profitTargetPct)
                    .div(100)
                : new Decimal(0);
              const progress = target.gt(0)
                ? Decimal.max(
                    new Decimal(challenge.equity).minus(challenge.accountSize),
                    0,
                  )
                    .div(target)
                    .mul(100)
                : new Decimal(0);
              return (
                <article key={challenge.id}>
                  <span>
                    <strong>{challenge.name}</strong>
                    <small>
                      {challenge.status} · purchased{" "}
                      {new Date(challenge.purchasedAt).toLocaleDateString()}
                    </small>
                  </span>
                  <span>
                    {currency(challenge.accountSize)} · balance{" "}
                    {currency(challenge.balance)} · equity{" "}
                    {currency(challenge.equity)}
                    <small>
                      Target {challenge.rules?.profitTargetPct ?? "N/A"}% ·
                      progress {progress.toFixed(2)}% · days{" "}
                      {challenge.tradingDays}/
                      {challenge.rules?.minTradingDays ?? "N/A"} · stage 1/
                      {challenge.stages}
                    </small>
                  </span>
                  <button
                    disabled={
                      busy ||
                      !["READY", "ACTIVE"].includes(challenge.status) ||
                      data.activeAccountId === challenge.accountId
                    }
                    onClick={() => void activate(challenge.id)}
                  >
                    {data.activeAccountId === challenge.accountId
                      ? "Active"
                      : "Set active"}
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="product-empty">No purchased challenges yet.</div>
        )}
      </section>
      <section>
        <h2>Payment history</h2>
        {data.payments.length ? (
          <div className="product-table">
            {data.payments.map((payment) => (
              <article key={payment.id}>
                <span>
                  <strong>{payment.productName}</strong>
                  <small>{new Date(payment.createdAt).toLocaleString()}</small>
                </span>
                <span>
                  {payment.status} · {payment.provider}
                  <small>
                    {payment.paymentId ?? "Payment confirmation pending"}
                  </small>
                </span>
                <strong>
                  {currency(payment.amount)} {payment.currency}
                </strong>
              </article>
            ))}
          </div>
        ) : (
          <div className="product-empty">No payment history.</div>
        )}
      </section>
      <p role="status">{message}</p>
    </div>
  );
}
