import { expect, test, type Page } from "@playwright/test";
import { newMockUser } from "../e2e/mock-wallet";
import { claimFaucet, connectWallet, glideScroll, pause, prepare, record, tap, typeInto } from "./helpers";

/**
 * Each test records one README walkthrough to docs/media/raw/<name>.webm.
 * Run `pnpm demo:record`, then `pnpm demo:gifs`. Needs the local chain, a deployment and the built app running (see the root README).
 */
test.describe.configure({ mode: "serial" });

/** The app renders some tab rows as role=tab and some as plain buttons; match either. */
const tabOrButton = (page: Page, name: RegExp) => page.getByRole("tab", { name }).or(page.getByRole("button", { name })).first();

test("01-landing", async ({ browser }) => {
  await record(browser, "01-landing", {}, async (page) => {
    await page.goto("/");
    await pause(page, 3200); // hero: SplitText headline + the looping value-flow diagram
    await glideScroll(page, "end", 6500);
  });
});

test("02-explore", async ({ browser }) => {
  await record(browser, "02-explore", {}, async (page) => {
    await page.goto("/explore");
    await expect(page.getByText("Aura-Llama-70B-Decentral").first()).toBeVisible();
    await pause(page, 1100);
    await tap(page, page.getByRole("button", { name: /^Image Generation/ }));
    await pause(page, 1000);
    await tap(page, page.getByRole("button", { name: /^All models/ }));
    await pause(page, 700);
    await typeInto(page, page.getByPlaceholder("Search…"), "voice", 90);
    await pause(page, 1100);
    await page.getByPlaceholder("Search…").fill("");
    await pause(page, 500);
    await page.locator("select").selectOption("price-desc"); // cards re-order with a Flip animation
    await pause(page, 1900); // let the Flip animation settle before clicking
    await tap(page, page.locator('a[href="/models/4"]').first()); // PredictNet-Financial-v2, now first by price
    await expect(page).toHaveURL(/\/models\/\d+/);
    await pause(page, 1100);
    for (const tab of [/performance/i, /api integration/i, /ownership/i]) {
      await tap(page, tabOrButton(page, tab));
      await pause(page, 1100);
    }
  });
});

test("03-wallet-and-assets", async ({ browser }) => {
  const user = await newMockUser();
  await record(browser, "03-wallet-and-assets", { wallet: user }, async (page) => {
    await page.goto("/");
    await pause(page, 900);
    await connectWallet(page, user, { slow: true });
    await tap(page, page.getByRole("link", { name: "My Assets" }).first());
    await pause(page, 1000);
    await claimFaucet(page, true);
    await pause(page, 1200);
    await typeInto(page, page.getByPlaceholder("0x…").first(), "0x000000000000000000000000000000000000dEaD", 12);
    await typeInto(page, page.getByPlaceholder("0.00").first(), "25");
    await pause(page, 1800); // the risk check flags the burn address before anything is signed
    await tap(page, page.getByRole("tab", { name: /erc-721/i }));
    await pause(page, 1000);
    await tap(page, page.getByRole("tab", { name: /erc-1155/i }));
    await pause(page, 1000);
  });
});

test("04-checkout-license", async ({ browser }) => {
  const prepared = await prepare(browser, { faucet: true });
  await record(browser, "04-checkout-license", { prepared }, async (page) => {
    await page.goto("/models/1");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Aura-Llama");
    await pause(page, 900);
    await tap(page, page.getByRole("radio", { name: /commercial/i }));
    await tap(page, page.getByRole("radio", { name: /personal/i }));
    await tap(page, page.getByRole("button", { name: /acquire license/i }));
    await pause(page, 700);
    await tap(page, tabOrButton(page, /credit card/i));
    await pause(page, 1100);
    await tap(page, tabOrButton(page, /royalty split/i));
    await pause(page, 1300);
    await tap(page, tabOrButton(page, /web3 crypto/i));
    await tap(page, page.getByText("Approve exact amount"));
    await tap(page, page.getByText("Permit signature (recommended)"));
    await tap(page, page.getByRole("button", { name: /mint erc-1155 license/i }));
    await expect(page.getByRole("button", { name: /^done$/i })).toBeVisible({ timeout: 40_000 });
    await pause(page, 1400);
    await tap(page, page.getByRole("button", { name: /^done$/i }));
    await tap(page, page.getByRole("link", { name: "My Assets" }).first());
    await tap(page, page.getByRole("tab", { name: /erc-1155/i }));
    await expect(page.getByRole("cell", { name: /personal/i })).toBeVisible({ timeout: 20_000 });
    await pause(page, 1200);
  });
});

test("05-api-console", async ({ browser }) => {
  const prepared = await prepare(browser, { faucet: true });
  await record(browser, "05-api-console", { prepared }, async (page) => {
    await page.goto("/console");
    await pause(page, 1200);
    await tap(page, page.getByRole("button", { name: /deposit credits/i }));
    await expect(page.getByText(/\$25\.00/).first()).toBeVisible({ timeout: 40_000 });
    await pause(page, 1200);
    await tap(page, page.getByRole("button", { name: /sign in with wallet/i }));
    const run = page.getByRole("button", { name: /run \d+ call/i });
    await expect(run).toBeVisible({ timeout: 20_000 });
    await tap(page, run);
    await expect(page.getByTestId("infer-result")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("infer-result").getByText(/settled on-chain/i)).toBeVisible();
    await pause(page, 2200);
    await tap(page, tabOrButton(page, /pay-per-use vs license/i));
    await pause(page, 1800);
    await tap(page, tabOrButton(page, /usage history/i));
    await pause(page, 2000);
  });
});

test("06-pricing-plans", async ({ browser }) => {
  const prepared = await prepare(browser, { faucet: true });
  await record(browser, "06-pricing-plans", { prepared }, async (page) => {
    await page.goto("/pricing");
    await expect(page.getByText("$29").first()).toBeVisible();
    await pause(page, 1500);
    await tap(page, page.getByRole("button", { name: /monthly billing/i }).or(page.getByRole("switch")).first());
    await pause(page, 1400);
    await tap(page, page.getByRole("button", { name: /choose pro/i }));
    await pause(page, 900);
    await tap(page, page.getByRole("button", { name: /subscribe & mint plan pass/i }));
    await expect(page.getByRole("button", { name: /^done$/i })).toBeVisible({ timeout: 40_000 });
    await pause(page, 1400);
    await tap(page, page.getByRole("button", { name: /^done$/i }));
    await tap(page, page.getByRole("link", { name: "My Assets" }).first());
    await pause(page, 1800); // "Plan pass" in the marketplace balances card now shows the on-chain expiry
  });
});

test("07-creator-dashboard", async ({ browser }) => {
  await record(browser, "07-creator-dashboard", {}, async (page) => {
    await page.goto("/dashboard");
    await pause(page, 900);
    await tap(page, page.getByRole("button", { name: /preview a top creator/i }).first());
    await expect(page.getByText(/monthly earnings/i)).toBeVisible({ timeout: 30_000 });
    await pause(page, 1800);
    await glideScroll(page, 520, 1500);
    await pause(page, 1800);
    await glideScroll(page, 0, 800);
    await tap(page, tabOrButton(page, /revenue split/i));
    await pause(page, 1500);
    await tap(page, tabOrButton(page, /mint & list/i));
    await pause(page, 1500);
  });
});
