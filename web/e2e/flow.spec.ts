import { expect, test } from "@playwright/test";
import { installMockWallet, newMockUser } from "./mock-wallet";

test.describe("marketplace flows (real local chain, mock wallet)", () => {
  test("explore → detail renders seeded on-chain models", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByRole("heading", { name: /explore/i }).first()).toBeVisible();
    await expect(page.getByText("Aura-Llama-70B-Decentral").first()).toBeVisible();
    await page.getByText("Aura-Llama-70B-Decentral").first().click();
    await expect(page).toHaveURL(/\/models\/\d+/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Aura-Llama");
  });

  test("connect wallet → faucet → buy license with permit → deposit credits → metered inference", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const user = await newMockUser();
    await installMockWallet(page, user);

    await page.goto("/");
    await page.getByRole("button", { name: /connect/i }).first().click();
    await page.getByRole("button", { name: /mock wallet/i }).click();
    await expect(page.getByRole("button", { name: new RegExp(user.address.slice(0, 6), "i") }).first()).toBeVisible();

    // ERC-20: faucet
    await page.goto("/assets");
    await page.getByRole("button", { name: /claim 1,000 nhusd/i }).click();
    await expect(page.getByText("$1,000.00").first()).toBeVisible({ timeout: 30_000 });

    // ERC-1155: buy a Personal license with a permit (one tx)
    await page.goto("/models/1");
    await page.getByRole("radio", { name: /personal/i }).click(); // choose the tier *before* the checkout modal covers the page
    await page.getByRole("button", { name: /acquire license/i }).click();
    await page.getByRole("button", { name: /mint erc-1155 license/i }).click();
    await expect(page.getByRole("button", { name: /^done$/i })).toBeVisible({ timeout: 40_000 });
    await page.getByRole("button", { name: /^done$/i }).click();

    // pay-per-use: deposit credits then sign in and run inference
    await page.goto("/console");
    await page.getByRole("button", { name: /deposit credits/i }).click();
    await expect(page.getByText(/\$25\.00/).first()).toBeVisible({ timeout: 40_000 });
    await page.getByRole("button", { name: /sign in with wallet/i }).click();
    await page.getByRole("button", { name: /run \d+ call/i }).click();
    await expect(page.getByTestId("infer-result")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("infer-result").getByText(/settled on-chain/i)).toBeVisible();

    // the license bought above is now visible as an ERC-1155 holding
    await page.goto("/assets");
    await page.getByRole("tab", { name: /erc-1155/i }).click();
    await expect(page.getByRole("cell", { name: /personal/i })).toBeVisible({ timeout: 20_000 });

    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("pricing page reads plan prices from the contract", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByText("$29").first()).toBeVisible();
    await expect(page.getByText("$79").first()).toBeVisible();
  });

  test("creator dashboard preview renders on-chain analytics; assets tabs render", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const user = await newMockUser();
    await installMockWallet(page, user);
    await page.goto("/");
    await page.getByRole("button", { name: /connect/i }).first().click();
    await page.getByRole("button", { name: /mock wallet/i }).click();

    await page.goto("/dashboard");
    await page.getByRole("button", { name: /preview a top creator/i }).first().click();
    await expect(page.getByText(/read-only preview/i)).toBeVisible();
    await expect(page.getByText(/monthly earnings/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("img", { name: /monthly earnings/i })).toBeVisible();
    await expect(page.getByText(/your models/i)).toBeVisible();

    await page.goto("/assets");
    await page.getByRole("tab", { name: /erc-721/i }).click();
    await expect(page.getByText(/don't own any model nfts/i)).toBeVisible({ timeout: 20_000 });
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
