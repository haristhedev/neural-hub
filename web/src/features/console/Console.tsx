"use client";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Card, EmptyState, Eyebrow, Skeleton, Stat } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Tabs } from "@/components/ui/Tabs";
import { Gauge } from "@/components/charts/Gauge";
import { Sparkline } from "@/components/charts/Sparkline";
import { RiskList, TxAction } from "@/components/tx/TxAction";
import { TxStepper } from "@/components/tx/TxStepper";
import { Reveal } from "@/components/motion/Reveal";
import { CountUp } from "@/components/motion/CountUp";
import { useAppChain } from "@/hooks/useAppChain";
import { useChainQuery } from "@/hooks/useChainQuery";
import { useAuth } from "@/features/auth/useAuth";
import { useCredits, useAllowance, useTokenBalance } from "@/features/account/hooks";
import { useModelViews } from "@/features/models/hooks";
import { buildPaidSteps, type ApprovalMethod } from "@/features/tx/payment";
import { useTxFlow } from "@/features/tx/useTxFlow";
import { RpcIndexer, bucketByDay } from "@/lib/web3/indexer";
import { useFeed } from "@/lib/store/feed";
import { useUi } from "@/lib/store/ui";
import { explorerTxUrl } from "@/lib/web3/chains";
import { PAYMENT_DECIMALS, PAYMENT_SYMBOL, PLANS } from "@/lib/web3/contracts";
import { formatUsd, shortAddress, timeAgo, usdNumber } from "@/lib/web3/format";
import { parseAmount } from "@/lib/validation";
import { usePublicClient } from "wagmi";
import type { PublicClient } from "viem";
import { cn } from "@/lib/utils";

interface InferResult { output: string; latencyMs: number; calls: number; txHash: `0x${string}`; cost: string; costFormatted: string; creditsRemaining: string }
type Panel = "run" | "pricing" | "history";

export function Console() {
  const { address, isConnected, chainId, chain } = useAppChain();
  const openWallet = useUi((s) => s.openWalletModal);
  const credits = useCredits(address);

  if (!isConnected) {
    return <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6"><EmptyState title="Connect a wallet to use the API console" body="Prepaid credits, metered calls and usage receipts are tied to your wallet address." action={<Button onClick={openWallet}>Connect wallet</Button>} /></div>;
  }
  return <ConsoleInner key={`${chainId}:${address}`} chainName={chain.name} creditsLoading={credits.isLoading} />;
}

function ConsoleInner({ chainName, creditsLoading }: { chainName: string; creditsLoading: boolean }) {
  const { address, chainId } = useAppChain();
  const [panel, setPanel] = useState<Panel>("run");
  const feed = useFeed((s) => s.items);
  const credits = useCredits(address);

  // gauge denominator = the high-water mark of credits seen this session, so the arc visibly "burns down" with usage
  const [peak, setPeak] = useState(0);
  const c = credits.data;
  if (c !== undefined && Number(c) > peak) setPeak(Number(c));

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <Reveal>
        <span className="label-mono">Pay-per-use API · {chainName}</span>
        <h1 className="mt-2 font-display text-5xl font-extrabold tracking-tight">API console</h1>
        <p className="mt-3 max-w-2xl text-ink-dim">Prepay credits once, then every call is metered and settled on-chain by the gateway. You can audit each charge as a transaction — and withdraw whatever you haven’t used.</p>
      </Reveal>

      <div className="mt-10 grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <Card className="flex flex-col items-center p-6">
            {creditsLoading || c === undefined ? <Skeleton className="h-32 w-full" /> : <Gauge fraction={peak ? Number(c) / peak : 0} label="Prepaid credits" value={formatUsd(c)} />}
            <p className="mt-2 text-xs text-ink-faint">Arc shows credits remaining vs. your session high-water mark.</p>
          </Card>
          <CreditsCard />
          <LiveFeed items={feed} chainId={chainId} />
        </div>

        <div className="min-w-0">
          <Tabs<Panel> value={panel} onChange={setPanel} tabs={[{ id: "run", label: "Run inference" }, { id: "pricing", label: "Pay-per-use vs license" }, { id: "history", label: "Usage history" }]} />
          <div className="pt-6">
            {panel === "run" && <RunPanel />}
            {panel === "pricing" && <BreakEven />}
            {panel === "history" && <History />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── credits: deposit / withdraw ─────────────────────────
function CreditsCard() {
  const { address, chainId, contracts } = useAppChain();
  const client = usePublicClient({ chainId }) as PublicClient | undefined;
  const credits = useCredits(address);
  const bal = useTokenBalance(address);
  const allowance = useAllowance(address, contracts?.marketplace.address);
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [amt, setAmt] = useState("25");
  const [method, setMethod] = useState<ApprovalMethod>("permit");
  const flow = useTxFlow({ chainId, title: mode === "deposit" ? "Credits deposited" : "Credits withdrawn" });
  const max = mode === "deposit" ? bal.data : credits.data;
  const parsed = parseAmount(amt, PAYMENT_DECIMALS, { max });

  const submit = async () => {
    if (!contracts || !client || !address || parsed.value === undefined) return;
    const value = parsed.value;
    if (mode === "withdraw") {
      await flow.run([{ id: "w", label: `Withdraw ${amt} credits`, exec: async (api) => void (await api.write({ ...contracts.marketplace, functionName: "withdrawCredits", args: [value] })) }]);
    } else {
      await flow.run(buildPaidSteps({ client, c: contracts, owner: address, amount: value, allowance: allowance.data ?? 0n, method, actionLabel: `Deposit ${amt} credits`, action: { ...contracts.marketplace, functionName: "depositCredits", args: [value] }, actionWithPermit: (s) => ({ ...contracts.marketplace, functionName: "depositCreditsWithPermit", args: [value, s.deadline, s.v, s.r, s.s] }) }));
    }
  };

  return (
    <Card className="space-y-4 p-6">
      <Tabs value={mode} onChange={(m) => { setMode(m); flow.reset(); }} tabs={[{ id: "deposit", label: "Deposit" }, { id: "withdraw", label: "Withdraw" }]} />
      <Field label={`Amount (${PAYMENT_SYMBOL})`} error={amt ? parsed.error : undefined} htmlFor="credit-amt" hint={`${mode === "deposit" ? "Wallet" : "Credits"}: ${formatUsd(max)}`}>
        <Input id="credit-amt" mono inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
      </Field>
      {mode === "deposit" && (
        <label className="flex items-center gap-2 text-xs text-ink-dim"><input type="checkbox" className="accent-[#8b5cf6]" checked={method === "permit"} onChange={(e) => setMethod(e.target.checked ? "permit" : "approve")} />Use gas-free permit signature</label>
      )}
      <TxStepper steps={flow.steps} status={flow.status} error={flow.error} chainId={chainId} />
      <TxAction size="md" loading={flow.isRunning} disabled={!!parsed.error || max === undefined} disabledReason={parsed.error ?? "Loading balances…"} onClick={submit}>{mode === "deposit" ? "Deposit credits" : "Withdraw credits"}</TxAction>
    </Card>
  );
}

// ───────────────────────── run inference ─────────────────────────
function RunPanel() {
  const params = useSearchParams();
  const { chainId } = useAppChain();
  const { evmSignedIn, signIn, errorMessage } = useAuth();
  const models = useModelViews();
  const qc = useQueryClient();
  const { address: me, chain } = useAppChain();
  const credits = useCredits(me);
  const listed = models.views.filter((m) => m.pricing.listed && m.pricing.perCall > 0n);
  const preset = Number(params.get("model"));
  const [picked, setPicked] = useState<number | null>(Number.isInteger(preset) && preset > 0 ? preset : null);
  const modelId = picked ?? listed[0]?.id;
  const model = listed.find((m) => m.id === modelId);
  const [calls, setCalls] = useState(5);
  const [prompt, setPrompt] = useState("Summarize the licensing terms for this model.");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InferResult | null>(null);
  const [err, setErr] = useState<{ title: string; body: string } | null>(null);

  const cost = model ? model.pricing.perCall * BigInt(calls) : 0n;
  const short = credits.data !== undefined && credits.data < cost;
  const risks = useMemo(() => (short ? [{ level: "warn" as const, code: "large-amount" as const, message: `Needs ${formatUsd(cost)} but you only have ${formatUsd(credits.data)} in credits — deposit more first.` }] : []), [short, cost, credits.data]);

  const run = async () => {
    if (!model) return;
    setBusy(true); setErr(null); setResult(null);
    try {
      const res = await fetch("/api/gateway/infer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chainId, modelId: model.id, calls, prompt }) });
      const json = await res.json();
      if (res.status === 401) setErr({ title: "Sign in required", body: "The gateway authenticates every request with your wallet session." });
      else if (res.status === 402) setErr({ title: "Insufficient credits (402)", body: json.message ?? "Deposit credits to continue." });
      else if (res.status === 429) setErr({ title: "Rate limited (429)", body: `Slow down — retry in ${Math.ceil((json.retryAfterMs ?? 1000) / 1000)}s.` });
      else if (!res.ok) setErr({ title: `Request failed (${res.status})`, body: json.message ?? json.error ?? "Unknown error" });
      else { setResult(json as InferResult); await qc.invalidateQueries({ queryKey: ["nh", chainId] }); }
    } catch (e) {
      setErr({ title: "Network error", body: (e as Error).message });
    } finally { setBusy(false); }
  };

  if (models.isLoading) return <Skeleton className="h-64" />;
  if (!listed.length) return <EmptyState title="No models are listed for pay-per-use" body="List a model with a per-call price from the creator dashboard." />;

  return (
    <div className="space-y-6">
      <Card className="space-y-5 p-6">
        <Field label="Model" htmlFor="model">
          <select id="model" value={modelId} onChange={(e) => { setPicked(Number(e.target.value)); setResult(null); }} className="h-11 w-full rounded-lg border border-line bg-bg-raised px-3 text-sm outline-none focus:border-accent">
            {listed.map((m) => <option key={m.id} value={m.id}>{m.meta?.name ?? `Model #${m.id}`} — {formatUsd(m.pricing.perCall)} / call</option>)}
          </select>
        </Field>
        <Field label="Prompt" htmlFor="prompt" hint="Max 500 characters — validated on the client and again by the server schema.">
          <Input id="prompt" value={prompt} maxLength={500} onChange={(e) => setPrompt(e.target.value)} />
        </Field>
        <div>
          <label htmlFor="calls" className="text-sm text-ink-dim">Calls in this batch: <b className="num text-ink">{calls}</b></label>
          <input id="calls" type="range" min={1} max={100} value={calls} onChange={(e) => setCalls(Number(e.target.value))} className="mt-2 w-full accent-[#8b5cf6]" />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-line-soft bg-bg/60 px-4 py-3 text-sm"><span className="text-ink-dim">Estimated charge</span><span className="num text-lg text-accent-hi">{formatUsd(cost)}</span></div>
        <RiskList flags={risks} />
        {!evmSignedIn ? (
          <div className="space-y-2">
            <Button size="lg" className="w-full" loading={signIn.isPending} onClick={() => signIn.mutate("evm")}>Sign in with wallet to call the API</Button>
            {errorMessage && <p role="alert" className="text-center text-xs text-bad">{errorMessage}</p>}
            <p className="text-center text-xs text-ink-faint">Signing is free — it proves you own this address (SIWE) so nobody can spend your credits.</p>
          </div>
        ) : (
          <TxAction loading={busy} disabled={!model || short} disabledReason="Deposit credits first" onClick={run}>Run {calls} call{calls > 1 ? "s" : ""} · settle on {chain.name}</TxAction>
        )}
      </Card>

      {err && <div role="alert" className="rounded-xl border border-bad/30 bg-bad/10 p-4 text-sm text-bad"><b>{err.title}</b><p className="mt-1 opacity-90">{err.body}</p></div>}
      {result && (
        <Card highlight className="space-y-4 p-6" data-testid="infer-result">
          <div className="flex flex-wrap items-center gap-3"><Badge tone="ok">settled on-chain</Badge><span className="num text-xs text-ink-dim">{result.latencyMs}ms · charged {formatUsd(BigInt(result.cost))} · remaining {formatUsd(BigInt(result.creditsRemaining))}</span></div>
          <pre className="scroll-thin overflow-x-auto whitespace-pre-wrap rounded-lg bg-bg p-4 font-mono text-[13px] text-ink-dim">{result.output}</pre>
          <p className="num text-xs text-ink-faint">Receipt: {explorerTxUrl(chain, result.txHash) ? <a className="text-accent-hi hover:underline" target="_blank" rel="noopener noreferrer" href={explorerTxUrl(chain, result.txHash)}>{shortAddress(result.txHash, 10, 8)} ↗</a> : shortAddress(result.txHash, 10, 8)}</p>
        </Card>
      )}
    </div>
  );
}

// ───────────────────────── break-even calculator ─────────────────────────
function BreakEven() {
  const models = useModelViews();
  const listed = models.views.filter((m) => m.pricing.listed);
  const [id, setId] = useState<number | null>(null);
  const [volume, setVolume] = useState(8_000);
  const m = listed.find((x) => x.id === (id ?? listed[0]?.id));
  const pro = useChainQuery(["plan-prices"], async ({ client, c }) => client.readContract({ ...c.marketplace, functionName: "planPrice", args: [1, false] }));
  if (!m) return <Skeleton className="h-48" />;
  const perCall = usdNumber(m.pricing.perCall);
  const payg = volume * perCall;
  const commercial = usdNumber(m.pricing.commercial) / 12; // commercial license term is 12 months
  const options = [
    { name: "Pay-per-use", cost: payg, note: "Pay only for what you call" },
    { name: "Commercial license (amortised/mo)", cost: commercial, note: "Flat; license NFT valid 12 months" },
    ...(pro.data !== undefined ? [{ name: `${PLANS[1].name} plan (monthly)`, cost: usdNumber(pro.data), note: "Includes 10k calls" }] : []),
  ];
  const best = options.reduce((a, b) => (b.cost < a.cost ? b : a));
  const max = Math.max(...options.map((o) => o.cost));
  return (
    <Card className="space-y-6 p-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Model" htmlFor="be-model"><select id="be-model" value={m.id} onChange={(e) => setId(Number(e.target.value))} className="h-11 w-full rounded-lg border border-line bg-bg-raised px-3 text-sm outline-none focus:border-accent">{listed.map((x) => <option key={x.id} value={x.id}>{x.meta?.name ?? `Model #${x.id}`}</option>)}</select></Field>
        <div><label htmlFor="be-vol" className="text-sm text-ink-dim">Calls / month: <b className="num text-ink">{volume.toLocaleString()}</b></label><input id="be-vol" type="range" min={100} max={200_000} step={100} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="mt-3 w-full accent-[#8b5cf6]" /></div>
      </div>
      <div className="space-y-4">
        {options.map((o) => (
          <div key={o.name}>
            <div className="mb-1.5 flex justify-between text-sm"><span className={cn(o === best && "font-semibold text-ok")}>{o.name}{o === best && " · cheapest"}</span><span className="num">${o.cost.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span></div>
            <div className="h-2.5 overflow-hidden rounded-full bg-bg"><div className={cn("h-full rounded-full transition-[width] duration-500", o === best ? "bg-ok" : "bg-accent/70")} style={{ width: `${Math.max(2, (o.cost / max) * 100)}%` }} /></div>
            <p className="mt-1 text-xs text-ink-faint">{o.note}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-ink-dim">Break-even versus the commercial license: <b className="num text-ink">{perCall > 0 ? Math.ceil(commercial / perCall).toLocaleString() : "—"}</b> calls per month.</p>
    </Card>
  );
}

// ───────────────────────── history (indexer) ─────────────────────────
function History() {
  const { address, chain } = useAppChain();
  const models = useModelViews();
  const names = useMemo(() => Object.fromEntries(models.views.map((m) => [m.id, m.meta?.name ?? `Model #${m.id}`])), [models.views]);
  const usage = useChainQuery(["usage-history", address], ({ client, c }) => new RpcIndexer(client, c).usage({ user: address! }), { enabled: !!address, refetchInterval: 20_000 });
  if (usage.isLoading) return <Skeleton className="h-64" />;
  const logs = usage.data ?? [];
  if (!logs.length) return <EmptyState title="No metered usage yet" body="Run an inference call — each one appears here as an on-chain receipt." />;
  const totalCalls = logs.reduce((s, l) => s + Number(l.data.calls), 0);
  const totalCost = logs.reduce((s, l) => s + l.data.cost, 0n);
  const daily = bucketByDay(logs, (l) => usdNumber(l.data.cost), 30);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total calls" value={<CountUp value={totalCalls} />} />
        <Stat label="Total spend" value={formatUsd(totalCost)} />
        <Stat label="Last 30 days" value={<Sparkline values={daily} width={140} height={34} />} />
      </div>
      <div className="scroll-thin overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-bg-raised"><tr className="label-mono text-left">{["When", "Model", "Calls", "Cost", "Tx"].map((h) => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}</tr></thead>
          <tbody>{[...logs].reverse().slice(0, 15).map((l) => (
            <tr key={`${l.txHash}-${l.logIndex}`} className="border-t border-line-soft">
              <td className="px-4 py-3 text-ink-dim">{timeAgo(l.timestamp)}</td><td className="px-4 py-3">{names[Number(l.data.modelId)] ?? `#${l.data.modelId}`}</td>
              <td className="num px-4 py-3">{l.data.calls.toString()}</td><td className="num px-4 py-3">{formatUsd(l.data.cost)}</td>
              <td className="num px-4 py-3 text-ink-dim">{explorerTxUrl(chain, l.txHash) ? <a className="text-accent-hi hover:underline" target="_blank" rel="noopener noreferrer" href={explorerTxUrl(chain, l.txHash)}>{shortAddress(l.txHash, 8, 6)}</a> : shortAddress(l.txHash, 8, 6)}</td>
            </tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}

// ───────────────────────── live feed ─────────────────────────
function LiveFeed({ items, chainId }: { items: ReturnType<typeof useFeed.getState>["items"]; chainId: number }) {
  void chainId;
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between"><Eyebrow>Live on-chain events</Eyebrow><span className="flex items-center gap-1.5 text-[11px] text-ok"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" />watching</span></div>
      {items.length === 0 ? <p className="text-sm text-ink-faint">Waiting for events… run a call and watch it land.</p> : (
        <ul className="space-y-2" aria-live="polite">{items.slice(0, 6).map((i) => <li key={i.id} className="text-xs leading-snug text-ink-dim"><span className="num text-ink-faint">{timeAgo(i.at / 1000)} · </span>{i.text}</li>)}</ul>
      )}
    </Card>
  );
}
