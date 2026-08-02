"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { TerminalState } from "../types";

type Instrument = TerminalState["instruments"][number];
type Filter = "Favorites" | "Crypto" | "Forex" | "Stocks" | "Indices";

interface Props {
  instrument: Instrument;
  instruments: Instrument[];
  favoriteIds: string[];
  onSelect(instrumentId: string): void;
  onToggleFavorite(instrumentId: string, enabled: boolean): Promise<void>;
}

export function AssetSelector(props: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("Crypto");
  const [prices, setPrices] = useState<Record<string, string | null>>({});
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return props.instruments.filter((item) => {
      if (filter === "Favorites" && !props.favoriteIds.includes(item.id))
        return false;
      if (filter !== "Favorites" && filter !== "Crypto") return false;
      return (
        !normalized ||
        item.symbol.toLowerCase().includes(normalized) ||
        item.displayName.toLowerCase().includes(normalized)
      );
    });
  }, [filter, props.favoriteIds, props.instruments, query]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetch("/api/market/snapshot", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("snapshot failed");
        const payload = (await response.json()) as {
          prices: { instrumentId: string; price: string | null }[];
        };
        setPrices(
          Object.fromEntries(
            payload.prices.map((item) => [item.instrumentId, item.price]),
          ),
        );
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, [open]);

  function choose(item: Instrument) {
    props.onSelect(item.id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div
      className="asset-selector"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
        if (!open || !filtered.length) return;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setActiveIndex((index) => (index + 1) % filtered.length);
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setActiveIndex(
            (index) => (index - 1 + filtered.length) % filtered.length,
          );
        }
        if (
          event.key === "Enter" &&
          document.activeElement?.getAttribute("role") === "combobox"
        ) {
          const item = filtered[activeIndex];
          if (item) choose(item);
        }
      }}
    >
      <button
        className="fusion-pair"
        aria-label={`Select asset, current ${props.instrument.symbol.replace("/", "")}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (!open) setStatus("loading");
          setOpen((value) => !value);
        }}
      >
        <strong>{props.instrument.symbol.replace("/", "")}</strong>
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div
          className="asset-popover"
          role="dialog"
          aria-label="Select trading asset"
        >
          <input
            autoFocus
            role="combobox"
            aria-controls="asset-options"
            aria-expanded="true"
            aria-activedescendant={
              filtered[activeIndex]
                ? `asset-${filtered[activeIndex].id}`
                : undefined
            }
            placeholder="Search ticker or name"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
          />
          <div className="asset-filters" aria-label="Market filters">
            {(
              ["Favorites", "Crypto", "Forex", "Stocks", "Indices"] as const
            ).map((item) => (
              <button
                key={item}
                className={filter === item ? "active" : ""}
                onClick={() => {
                  setFilter(item);
                  setActiveIndex(0);
                }}
              >
                {item}
              </button>
            ))}
          </div>
          {status === "loading" && (
            <p role="status" className="asset-state">
              Loading prices…
            </p>
          )}
          {status === "error" && (
            <p role="alert" className="asset-state">
              Prices are unavailable. Instruments can still be selected.
            </p>
          )}
          <div id="asset-options" role="listbox">
            {filtered.map((item, index) => (
              <div
                id={`asset-${item.id}`}
                role="option"
                aria-selected={item.id === props.instrument.id}
                className={index === activeIndex ? "active" : ""}
                key={item.id}
              >
                <button className="asset-choice" onClick={() => choose(item)}>
                  <span>
                    <strong>{item.symbol.replace("/", "")}</strong>
                    <small>{item.displayName} · Crypto</small>
                  </span>
                  <span>{prices[item.id] ? `$${prices[item.id]}` : "N/A"}</span>
                </button>
                <button
                  className="asset-star"
                  aria-label={`${props.favoriteIds.includes(item.id) ? "Remove" : "Add"} ${item.symbol} ${props.favoriteIds.includes(item.id) ? "from" : "to"} favorites`}
                  aria-pressed={props.favoriteIds.includes(item.id)}
                  onClick={() =>
                    void props.onToggleFavorite(
                      item.id,
                      !props.favoriteIds.includes(item.id),
                    )
                  }
                >
                  ★
                </button>
              </div>
            ))}
            {!filtered.length && (
              <p className="asset-state">No instruments match this filter.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
