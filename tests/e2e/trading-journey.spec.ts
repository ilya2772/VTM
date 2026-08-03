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

  const sizeSlider = page.getByRole("slider", {
    name: "Position size percentage",
  });
  await page.getByRole("button", { name: "Set position size to 25%" }).click();
  await expect(page.getByRole("textbox", { name: "Order size" })).toHaveValue(
    "12500.00",
  );
  await sizeSlider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(sizeSlider).toHaveValue("26");
  await expect(page.getByRole("textbox", { name: "Order size" })).toHaveValue(
    "13000.00",
  );

  const solana = page.getByRole("button", {
    name: /^SOLUSD Solana \/ US Dollar/,
  });
  await solana.click();
  await expect(solana).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".fusion-live-price")).toContainText("$");
  await expect(page.getByText("DEMO DATA", { exact: true })).toHaveCount(0);

  await page.getByRole("textbox", { name: "Order size" }).fill("500");
  await page.getByRole("combobox", { name: "Leverage" }).selectOption("2");
  await page.getByRole("textbox", { name: "Stop Loss" }).fill("160");
  await page.getByRole("textbox", { name: "Take Profit" }).fill("200");
  await expect(page.getByText(/Possible loss \(LONG\):/)).toBeVisible();
  await expect(page.getByText(/Potential profit \(LONG\):/)).toBeVisible();

  const openLong = page.getByRole("button", { name: "Open Long" });
  await expect(openLong).toBeEnabled();
  await openLong.click();
  const confirmation = page.getByRole("dialog", { name: "Confirm LONG" });
  await expect(confirmation).toBeVisible();
  await expect(
    confirmation.getByText("Risk / reward", { exact: true }),
  ).toBeVisible();
  await confirmation.getByRole("button", { name: "Confirm LONG" }).click();
  await expect(page.getByRole("status")).toHaveText("LONG позиция открыта.");

  const positions = page.getByRole("article", {
    name: "LONG position SOL/USD",
  });
  await expect(positions).toHaveCount(1);
  const chartLevels = page.getByRole("region", {
    name: "Active trade levels for SOL/USD",
  });
  await expect(chartLevels).toContainText("POSITION · LONG");
  await expect(chartLevels).toContainText("SL $160.00 · TP $200.00");

  await openLong.click();
  const secondConfirmation = page.getByRole("dialog", {
    name: "Confirm LONG",
  });
  await secondConfirmation
    .getByRole("button", { name: "Confirm LONG" })
    .click();
  await expect(positions).toHaveCount(2);

  const desktopLayout = await page
    .locator(".fusion-app")
    .evaluate((element) => {
      const shell = element.getBoundingClientRect();
      const chart = document
        .querySelector(".fusion-chart-zone")
        ?.getBoundingClientRect();
      const orderDesk = document
        .querySelector(".fusion-order-desk")
        ?.getBoundingClientRect();
      return {
        shellHeight: shell.height,
        viewportHeight: window.innerHeight,
        chartBottom: chart?.bottom ?? Number.POSITIVE_INFINITY,
        orderDeskTop: orderDesk?.top ?? Number.POSITIVE_INFINITY,
      };
    });
  expect(desktopLayout.shellHeight).toBeLessThanOrEqual(
    desktopLayout.viewportHeight,
  );
  expect(desktopLayout.chartBottom).toBeLessThanOrEqual(
    desktopLayout.viewportHeight,
  );
  expect(desktopLayout.orderDeskTop).toBeLessThan(desktopLayout.viewportHeight);

  const position = positions.first();
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
  await position.getByLabel("Edit Stop Loss for LONG").fill("165");
  await position.getByLabel("Edit Take Profit for LONG").fill("205");
  await position.getByRole("button", { name: "Save SL/TP" }).click();
  await expect(
    page.getByText("Защитные уровни позиции обновлены."),
  ).toBeVisible();

  await position.getByRole("button", { name: "25%" }).click();
  await position.getByRole("button", { name: "Close quantity" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Позиция частично закрыта.",
  );
  await position.getByRole("button", { name: "Close full" }).click();
  await expect(page.getByRole("status")).toHaveText("Позиция закрыта.");
  await expect(positions).toHaveCount(1);
  await positions.first().getByRole("button", { name: "Close full" }).click();
  await expect(positions).toHaveCount(0);

  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByText("SOL/USD CLOSE").first()).toBeVisible();

  await page.getByRole("tab", { name: "Positions 0" }).click();
  await page.getByRole("textbox", { name: "Stop Loss" }).fill("190");
  await page.getByRole("textbox", { name: "Take Profit" }).fill("150");
  const openShort = page.getByRole("button", { name: "Open Short" });
  await expect(openShort).toBeEnabled();
  await openShort.click();
  const shortConfirmation = page.getByRole("dialog", {
    name: "Confirm SHORT",
  });
  await shortConfirmation
    .getByRole("button", { name: "Confirm SHORT" })
    .click();
  const shortPosition = page.getByRole("article", {
    name: "SHORT position SOL/USD",
  });
  await expect(shortPosition).toBeVisible();
  await shortPosition.getByRole("button", { name: "Close full" }).click();
  await expect(shortPosition).toHaveCount(0);
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
  await expect(page.getByRole("heading", { name: "Markets" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Dashboard workspace" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Trade", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Торговый терминал" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});
