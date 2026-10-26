import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a real local chain (`pnpm chain` + `pnpm deploy:local`) with a mock EIP-1193
 * wallet injected into the page (see e2e/mock-wallet.ts), so they exercise the real wagmi/viem code path.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
