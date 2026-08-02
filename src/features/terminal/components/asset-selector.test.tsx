import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AssetSelector } from "./asset-selector";

const btc = {
  id: "btc",
  symbol: "BTC/USD",
  displayName: "Bitcoin / US Dollar",
  baseAsset: "BTC",
  quoteAsset: "USD",
  source: "PYTH" as const,
};
const eth = {
  id: "eth",
  symbol: "ETH/USD",
  displayName: "Ether / US Dollar",
  baseAsset: "ETH",
  quoteAsset: "USD",
  source: "PYTH" as const,
};
const instruments = [btc, eth];

describe("AssetSelector", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              prices: [{ instrumentId: "btc", price: "70000" }],
            }),
          ),
      ),
    );
  });

  it("searches, selects, closes and toggles favorites", async () => {
    const onSelect = vi.fn();
    const onToggleFavorite = vi.fn(async () => undefined);
    render(
      <AssetSelector
        instrument={eth}
        instruments={instruments}
        favoriteIds={[]}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /ETHUSD/i }));
    const search = screen.getByRole("combobox");
    fireEvent.change(search, { target: { value: "Bitcoin" } });
    await waitFor(() => expect(screen.getByText("$70000")).toBeInTheDocument());
    fireEvent.click(
      screen.getByRole("button", { name: /Add BTC\/USD to favorites/i }),
    );
    expect(onToggleFavorite).toHaveBeenCalledWith("btc", true);
    fireEvent.click(screen.getByRole("button", { name: /BTCUSD/i }));
    expect(onSelect).toHaveBeenCalledWith("btc");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("closes with Escape", () => {
    render(
      <AssetSelector
        instrument={btc}
        instruments={instruments}
        favoriteIds={[]}
        onSelect={vi.fn()}
        onToggleFavorite={vi.fn(async () => undefined)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /BTCUSD/i }));
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
