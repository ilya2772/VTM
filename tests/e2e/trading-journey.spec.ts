import { expect, test } from "@playwright/test";

test("completes the deterministic simulated trading journey", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await page.route(
    "https://s3.tradingview.com/**",
    async (route) => void route.abort(),
  );

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Axiom Prop Terminal" }),
  ).toBeVisible();
  await page.getByLabel("Email").fill("demo@axiom.local");
  await page.getByLabel("Пароль").fill("AxiomDemo!2026");
  await page.getByRole("button", { name: "Открыть терминал" }).click();
  await expect(page.getByText("AXIOM", { exact: true })).toBeVisible();

  const bitcoin = page.getByRole("button", {
    name: /BTCUSD Bitcoin \/ US Dollar DEMO/,
  });
  await bitcoin.click();
  await expect(bitcoin).toHaveAttribute("aria-pressed", "true");

  const fiveMinutes = page.getByRole("button", { name: "5m", exact: true });
  await fiveMinutes.click();
  await expect(fiveMinutes).toHaveAttribute("aria-pressed", "true");

  const openLong = page.getByRole("button", { name: "Open Long" });
  await expect(openLong).toBeEnabled();
  await openLong.click();
  const confirmation = page.getByRole("dialog", { name: "Confirm LONG" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Confirm LONG" }).click();
  await expect(page.getByRole("status")).toHaveText("LONG позиция открыта.");

  const position = page.getByRole("article", {
    name: "LONG position BTC/USD",
  });
  await expect(position).toBeVisible();
  const livePnl = position
    .locator("dt", { hasText: "Live unrealized PnL" })
    .locator("..")
    .locator("dd");
  const firstPnl = await livePnl.textContent();
  await expect
    .poll(async () => livePnl.textContent(), { timeout: 5_000 })
    .not.toBe(firstPnl);

  await position.getByRole("button", { name: "Edit SL/TP" }).click();
  await position.getByLabel("Edit Stop Loss for LONG").fill("65000");
  await position.getByLabel("Edit Take Profit for LONG").fill("70000");
  await position.getByRole("button", { name: "Save SL/TP" }).click();
  await expect(
    page.getByText("Защитные уровни позиции обновлены."),
  ).toBeVisible();

  await position.getByRole("button", { name: "Close full" }).click();
  await expect(page.getByRole("status")).toHaveText("Позиция закрыта.");
  await expect(position).toHaveCount(0);

  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByText("BTC/USD CLOSE")).toBeVisible();

  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Journal" })
    .click();
  const journal = page.getByRole("region", { name: "Journal workspace" });
  await expect(journal).toBeVisible();
  await expect(
    journal.getByRole("table", { name: "Closed trade journal" }),
  ).toContainText("BTC/USD LONG");
  await expect(journal).toContainText("Entry");
  await expect(journal).toContainText("Exit");
});

test("keeps responsive layouts keyboard accessible", async ({ page }) => {
  await page.route(
    "https://s3.tradingview.com/**",
    async (route) => void route.abort(),
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Открыть терминал" }).click();
  await expect(page.getByText("AXIOM", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);

  const skipLink = page.getByRole("link", { name: "К торговому терминалу" });
  await skipLink.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#trade-workspace$/);

  const orderSize = page.getByRole("textbox", { name: "Order size" });
  const sizeUnit = page.getByRole("combobox", { name: "Size unit" });
  await orderSize.focus();
  await page.keyboard.press("Tab");
  await expect(sizeUnit).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("region", { name: "Торговый терминал" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});
