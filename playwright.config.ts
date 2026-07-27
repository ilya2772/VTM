import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  globalSetup: "./tests/e2e/global-setup.ts",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "line",
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3107",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev --port 3107",
    url: "http://localhost:3107",
    reuseExistingServer: false,
    env: {
      ...process.env,
      DATABASE_URL:
        "postgresql://postgres@127.0.0.1:55439/axiom_e2e?schema=public",
      MARKET_DATA_MODE: "demo",
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
