#!/usr/bin/env node
// HTTP smoke test for a running NeuralHub instance (local or hosted). No dependencies.
//   node scripts/smoke.mjs --url https://your-app.example [--rpc https://sepolia.base.org --chain-id 84532]
// Exits non-zero if any check fails, so it can gate a deploy.

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]?.startsWith("--") ? "true" : (all[i + 1] ?? "true")]] : acc), []),
);
const base = (args.url ?? process.env.SMOKE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const secure = base.startsWith("https://");
const results = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
  } catch (e) {
    results.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
  }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const get = (path, init) => fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(20_000), ...init });

for (const path of ["/", "/explore", "/pricing", "/console", "/dashboard", "/assets", "/models/1"]) {
  await check(`GET ${path} renders`, async () => {
    const res = await get(path);
    expect(res.status === 200, `status ${res.status}`);
    expect((res.headers.get("content-type") ?? "").includes("text/html"), "not html");
    return "200";
  });
}

await check("unknown route is a 404", async () => { const r = await get("/definitely-not-a-page"); expect(r.status === 404, `status ${r.status}`); });

await check("security headers are set", async () => {
  const h = (await get("/")).headers;
  expect(h.get("x-content-type-options") === "nosniff", "missing nosniff");
  expect(h.get("x-frame-options") === "DENY", "missing X-Frame-Options: DENY");
  expect(Boolean(h.get("referrer-policy")), "missing Referrer-Policy");
  expect(Boolean(h.get("permissions-policy")), "missing Permissions-Policy");
});

await check("sign-in nonce is JSON with a hardened cookie", async () => {
  const res = await get("/api/auth/nonce");
  expect(res.status === 200, `status ${res.status}`);
  const body = await res.json();
  expect(typeof body.nonce === "string" && body.nonce.length >= 16, "no nonce in body");
  const cookie = res.headers.get("set-cookie") ?? "";
  expect(/nh_nonce=/.test(cookie), "nonce cookie not set");
  expect(/httponly/i.test(cookie), "nonce cookie is not HttpOnly");
  expect(/samesite=(lax|strict)/i.test(cookie), "nonce cookie lacks SameSite");
  if (secure) expect(/;\s*secure/i.test(cookie), "nonce cookie lacks Secure on https");
});

await check("metered gateway rejects unauthenticated calls with JSON 401", async () => {
  const res = await get("/api/gateway/infer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ modelId: 1, calls: 1, prompt: "hi" }) });
  expect(res.status === 401, `status ${res.status}`);
  expect((res.headers.get("content-type") ?? "").includes("application/json"), "error is not JSON");
});

await check("ERC-1155 metadata route serves a license (64-hex id per EIP-1155)", async () => {
  const id = (0x101).toString(16).padStart(64, "0"); // model 1, tier 1 (Personal)
  const res = await get(`/api/licenses/${id}.json`);
  expect(res.status === 200, `status ${res.status}`);
  const meta = await res.json();
  expect(/Personal/.test(meta.name ?? "") && Array.isArray(meta.attributes), `unexpected body ${JSON.stringify(meta).slice(0, 80)}`);
});

await check("ERC-1155 metadata route rejects a malformed id with JSON 400", async () => {
  const res = await get("/api/licenses/not-hex.json");
  expect(res.status === 400, `status ${res.status}`);
  expect((res.headers.get("content-type") ?? "").includes("application/json"), "error is not JSON");
});

if (args.rpc) {
  await check(`RPC ${args.rpc} reports chain ${args["chain-id"] ?? "?"}`, async () => {
    const res = await fetch(args.rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }), signal: AbortSignal.timeout(20_000) });
    const { result } = await res.json();
    if (args["chain-id"]) expect(parseInt(result, 16) === Number(args["chain-id"]), `got chain ${parseInt(result, 16)}`);
    return `chain ${parseInt(result, 16)}`;
  });
}

let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
  if (!r.ok) failed++;
}
console.log(`\n${results.length - failed}/${results.length} smoke checks passed against ${base}`);
process.exit(failed ? 1 : 0);
