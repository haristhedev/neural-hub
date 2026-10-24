import { NextResponse, type NextRequest } from "next/server";
import { safeRoute } from "@/lib/server/http";
import { formatUnits, type Address } from "viem";
import { gatewayRequestSchema } from "@/lib/validation";
import { getSession } from "@/lib/server/session";
import { rateLimit } from "@/lib/server/rateLimit";
import { gatewayClients, mockInference, newBatchId, serial } from "@/lib/server/gateway";
import { PAYMENT_DECIMALS } from "@/lib/web3/contracts";

export const dynamic = "force-dynamic";

/**
 * API gateway — the metered inference endpoint.
 *   1. authenticate (wallet-login session cookie)      2. rate-limit per wallet
 *   3. check the caller's prepaid credits on-chain      4. "run" the model
 *   5. settle usage on-chain with the GATEWAY_ROLE signer (idempotent batch id)
 * The browser never holds the gateway key; users cannot self-report usage.
 */
export const POST = safeRoute(async (req: NextRequest) => {
  const session = await getSession();
  if (!session || session.family !== "evm") return NextResponse.json({ error: "unauthenticated", message: "Sign in with an EVM wallet first." }, { status: 401 });

  const rl = rateLimit(`infer:${session.address}`, { limit: 12, windowMs: 10_000 });
  if (!rl.ok) return NextResponse.json({ error: "rate_limited", retryAfterMs: rl.retryAfterMs }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } });

  const parsed = gatewayRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", issues: parsed.error.flatten() }, { status: 400 });
  const { chainId, modelId, calls, prompt } = parsed.data;

  let g: ReturnType<typeof gatewayClients>;
  try { g = gatewayClients(chainId); } catch (e) { return NextResponse.json({ error: "gateway_unconfigured", message: (e as Error).message }, { status: 503 }); }
  if (!g) return NextResponse.json({ error: "unsupported_chain" }, { status: 404 });
  const { contracts: c, publicClient, walletClient } = g;
  const user = session.address as Address;

  try {
    const [pricing, credits, info] = await Promise.all([
      publicClient.readContract({ ...c.marketplace, functionName: "getPricing", args: [BigInt(modelId)] }),
      publicClient.readContract({ ...c.marketplace, functionName: "credits", args: [user] }),
      publicClient.readContract({ ...c.modelNFT, functionName: "modelInfo", args: [BigInt(modelId)] }).catch(() => null),
    ]);
    if (!info || !pricing.listed || pricing.perCall === 0n) return NextResponse.json({ error: "model_unavailable" }, { status: 404 });

    const cost = pricing.perCall * BigInt(calls);
    if (credits < cost) {
      return NextResponse.json(
        { error: "insufficient_credits", message: "Deposit more credits to run this request.", have: credits.toString(), need: cost.toString() },
        { status: 402 }, // Payment Required
      );
    }

    const started = performance.now();
    const output = mockInference(Number(info.category), prompt, calls);
    await new Promise((r) => setTimeout(r, 120 + Math.random() * 180)); // simulated model latency
    const latencyMs = Math.round(performance.now() - started);

    const batchId = newBatchId(user, modelId);
    const txHash = await serial(async () => {
      const { request } = await publicClient.simulateContract({ account: walletClient.account, ...c.marketplace, functionName: "recordUsage", args: [batchId, BigInt(modelId), user, BigInt(calls)] });
      const hash = await walletClient.writeContract(request);
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    });

    return NextResponse.json({
      output,
      latencyMs,
      calls,
      batchId,
      txHash,
      cost: cost.toString(),
      costFormatted: formatUnits(cost, PAYMENT_DECIMALS),
      creditsRemaining: (credits - cost).toString(),
    });
  } catch (e) {
    console.error("[gateway]", (e as Error).message);
    return NextResponse.json({ error: "settlement_failed", message: "Could not settle usage on-chain." }, { status: 502 });
  }
});
