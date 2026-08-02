import { expect, test } from "@playwright/test";

test("selects an asset and completes a mock challenge purchase", async ({
  page,
}) => {
  test.setTimeout(45_000);
  const serverFailures: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 500)
      serverFailures.push(response.url());
  });
  await page.route(
    "https://s3.tradingview.com/**",
    async (route) => void route.abort(),
  );
  await page.goto("/");
  await page.getByLabel("Email").fill("demo@axiom.local");
  await page.getByLabel("Пароль").fill("AxiomDemo!2026");
  await page.getByRole("button", { name: "Открыть терминал" }).click();

  await page.getByRole("button", { name: /Select asset, current/i }).click();
  await page.getByPlaceholder("Search ticker or name").fill("Ether");
  await page.getByRole("button", { name: "Add ETH/USD to favorites" }).click();
  await page
    .getByRole("option", { name: /ETHUSD/ })
    .getByRole("button")
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Select asset, current ETHUSD" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Challenges" }).click();
  await expect(page.getByRole("heading", { name: "Challenges" })).toBeVisible();
  const starter = page
    .locator(".challenge-grid article")
    .filter({ hasText: "Starter 10K" });
  await starter.getByRole("button", { name: "View details" }).click();
  await expect(
    page.getByRole("heading", { name: "Starter 10K" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Buy Challenge/ }).click();

  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  const purchased = page
    .locator(".product-table article")
    .filter({ hasText: "Starter 10K" })
    .first();
  await expect(purchased).toContainText("READY");
  await purchased.getByRole("button", { name: "Set active" }).click();
  await expect(
    purchased.getByRole("button", { name: "Active" }),
  ).toBeDisabled();

  await page.reload();
  expect(serverFailures).toEqual([]);
  await expect(page.locator(".fusion-account-meta")).toContainText(
    "$10,000.00",
  );
  await expect(
    page.getByRole("button", { name: "Select asset, current ETHUSD" }),
  ).toBeVisible();
});
