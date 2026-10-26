import { expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { installMockWallet, newMockUser, type MockUser } from "../e2e/mock-wallet";

export const VIEWPORT = { width: 1280, height: 800 };
export const RAW_DIR = path.resolve(__dirname, "../../docs/media/raw");

/** A visible cursor + click feedback, injected after hydration (Playwright's video recorder does not draw the pointer). */
const CURSOR_SCRIPT = () => {
  const install = () => {
    if (document.getElementById("__demo-cursor")) return;
    const dot = document.createElement("div");
    dot.id = "__demo-cursor";
    dot.style.cssText =
      "position:fixed;z-index:2147483647;pointer-events:none;width:20px;height:20px;border-radius:50%;left:-60px;top:-60px;" +
      "background:rgba(255,255,255,.92);border:2px solid #8b5cf6;box-shadow:0 0 0 5px rgba(139,92,246,.28),0 2px 10px rgba(0,0,0,.5);" +
      "transform:translate(-50%,-50%);transition:transform .12s ease";
    document.body.appendChild(dot);
    addEventListener("mousemove", (e) => { dot.style.left = `${e.clientX}px`; dot.style.top = `${e.clientY}px`; }, true);
    addEventListener("mousedown", () => { dot.style.transform = "translate(-50%,-50%) scale(.6)"; }, true);
    addEventListener("mouseup", () => { dot.style.transform = "translate(-50%,-50%) scale(1)"; }, true);
  };
  // wait until React has hydrated so the extra node can't cause a hydration mismatch
  const go = () => setTimeout(install, 900);
  if (document.readyState === "complete") go(); else addEventListener("load", go);
};

export const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

/** Glide the visible cursor to the target, then click it like a person would. */
export async function tap(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
  await pause(page, 160);
  await target.click({ delay: 60 });
  await pause(page, 260);
}

export async function hover(page: Page, target: Locator, hold = 500) {
  const box = await target.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 });
  await pause(page, hold);
}

export async function typeInto(page: Page, target: Locator, text: string, delay = 70) {
  await tap(page, target);
  await target.pressSequentially(text, { delay });
  await pause(page, 300);
}

/** Eased, time-based scroll so the GSAP scroll reveals play naturally. */
export async function glideScroll(page: Page, to: number | "end", ms = 3000) {
  await page.evaluate(
    ({ to, ms }) =>
      new Promise<void>((resolve) => {
        const start = window.scrollY;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const end = to === "end" ? max : Math.min(to, max);
        const t0 = performance.now();
        const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
        const tick = (now: number) => {
          const t = Math.min(1, (now - t0) / ms);
          window.scrollTo(0, start + (end - start) * ease(t));
          if (t < 1) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      }),
    { to, ms },
  );
}

export async function connectWallet(page: Page, user: MockUser, { slow = false } = {}) {
  const connect = page.getByRole("button", { name: /connect/i }).first();
  if (slow) await tap(page, connect);
  else await connect.click();
  await expect(page.getByRole("button", { name: /mock wallet/i })).toBeVisible();
  if (slow) await pause(page, 2200);
  const mock = page.getByRole("button", { name: /mock wallet/i });
  if (slow) await tap(page, mock);
  else await mock.click();
  await expect(page.getByRole("button", { name: new RegExp(user.address.slice(0, 6), "i") }).first()).toBeVisible();
  if (slow) {
    // step 2 of the connect flow: free SIWE message signature that unlocks authenticated features
    const dialog = page.getByRole("dialog", { name: /connect wallet/i });
    await expect(dialog.getByText(/verify it's you/i)).toBeVisible();
    await pause(page, 1600);
    await tap(page, dialog.getByRole("button", { name: /sign message/i }));
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await pause(page, 600);
  }
}

export async function claimFaucet(page: Page, slow = false) {
  const claim = page.getByRole("button", { name: /claim 1,000 nhusd/i });
  if (slow) await tap(page, claim);
  else await claim.click();
  await expect(page.getByText("$1,000.00").first()).toBeVisible({ timeout: 30_000 });
}

export interface Prepared { user: MockUser; state: Awaited<ReturnType<BrowserContext["storageState"]>> }

/** Off-camera setup: a fresh funded wallet that is already connected (and optionally holds NHUSD from the faucet). */
export async function prepare(browser: Browser, { faucet = false } = {}): Promise<Prepared> {
  const user = await newMockUser();
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  await installMockWallet(page, user);
  await page.goto("/");
  await connectWallet(page, user);
  if (faucet) {
    await page.goto("/assets");
    await claimFaucet(page);
  }
  const state = await ctx.storageState();
  await ctx.close();
  return { user, state };
}

/** Records one scene to docs/media/raw/<name>.webm. */
export async function record(
  browser: Browser,
  name: string,
  opts: { prepared?: Prepared; wallet?: MockUser },
  scene: (page: Page, ctx: BrowserContext) => Promise<void>,
) {
  mkdirSync(RAW_DIR, { recursive: true });
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    storageState: opts.prepared?.state,
    recordVideo: { dir: path.join(RAW_DIR, ".tmp"), size: VIEWPORT },
  });
  await ctx.addInitScript(CURSOR_SCRIPT);
  const page = await ctx.newPage();
  const user = opts.prepared?.user ?? opts.wallet;
  // a prepared wallet is already authorised for this site; the mock keeps that flag in sessionStorage (per tab)
  if (opts.prepared) await page.addInitScript(() => sessionStorage.setItem("mock-connected", "1"));
  if (user) await installMockWallet(page, user);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await scene(page, ctx);
    await pause(page, 1200); // hold the final frame
  } finally {
    const video = page.video();
    await ctx.close();
    await video?.saveAs(path.join(RAW_DIR, `${name}.webm`));
  }
  // React #418 (a rare hydration mismatch) is logged rather than failing the recording; anything else is a real error.
  const hydration = errors.filter((e) => /error #418/.test(e));
  if (hydration.length) console.warn(`[${name}] intermittent React hydration warning (#418) x${hydration.length}`);
  const fatal = errors.filter((e) => !/error #418/.test(e));
  expect(fatal, fatal.join("\n")).toEqual([]);
}
