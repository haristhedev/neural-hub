"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { isAddress, parseEventLogs, type Address } from "viem";
import { Badge, Card, EmptyState, Eyebrow, Skeleton, Stat } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Tabs } from "@/components/ui/Tabs";
import { LineChart } from "@/components/charts/LineChart";
import { Heatmap } from "@/components/charts/Heatmap";
import { Sparkline } from "@/components/charts/Sparkline";
import { Donut } from "@/components/charts/Donut";
import { TxAction } from "@/components/tx/TxAction";
import { TxStepper } from "@/components/tx/TxStepper";
import { Reveal } from "@/components/motion/Reveal";
import { CountUp } from "@/components/motion/CountUp";
import { useAppChain } from "@/hooks/useAppChain";
import { useChainQuery } from "@/hooks/useChainQuery";
import { usePending } from "@/features/account/hooks";
import { useModelViews, type ModelView } from "@/features/models/hooks";
import { useTxFlow } from "@/features/tx/useTxFlow";
import { RpcIndexer, bucketByDay, bucketByMonth } from "@/lib/web3/indexer";
import { useUi } from "@/lib/store/ui";
import { CATEGORIES, PAYMENT_DECIMALS } from "@/lib/web3/contracts";
import { bpsToPct, compact, formatUsd, shortAddress, usdNumber } from "@/lib/web3/format";
import { parseAmount } from "@/lib/validation";

type Panel = "overview" | "split" | "mint";

export function Dashboard() {
  const { address, isConnected } = useAppChain();
  const openWallet = useUi((s) => s.openWalletModal);
  const models = useModelViews();
  const [viewAs, setViewAs] = useState<Address | null>(null);
  const [panel, setPanel] = useState<Panel>("overview");

  const mine = (who?: Address) => models.views.filter((m) => who && m.owner.toLowerCase() === who.toLowerCase());
  const ownedByMe = mine(address);
  const subject = viewAs ?? address;
  const owned = viewAs ? mine(viewAs) : ownedByMe;
  const readOnly = !!viewAs;

  // local-demo convenience: preview the dashboard of the creator with the most revenue
  const topCreator = useMemo(() => [...models.views].sort((a, b) => Number(b.totalRevenue - a.totalRevenue))[0]?.owner, [models.views]);

  if (!isConnected && !viewAs) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
        <EmptyState title="Connect a wallet to open your creator dashboard" body="Revenue, royalties and model analytics are derived from on-chain events for your address." action={<div className="flex gap-3"><Button onClick={openWallet}>Connect wallet</Button>{topCreator && <Button variant="secondary" onClick={() => setViewAs(topCreator)}>Preview a top creator</Button>}</div>} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <Reveal className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label-mono">Creator dashboard</span>
          <h1 className="mt-2 font-display text-5xl font-extrabold tracking-tight">Revenue &amp; royalties</h1>
          <p className="mt-3 text-ink-dim">Every figure is rebuilt from contract events — no private analytics database.</p>
        </div>
        <Tabs<Panel> value={panel} onChange={setPanel} tabs={[{ id: "overview", label: "Overview" }, { id: "split", label: "Revenue split" }, { id: "mint", label: "Mint & list" }]} />
      </Reveal>

      {readOnly ? (
        <div role="status" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
          <span>Read-only preview of creator <span className="num">{shortAddress(viewAs!)}</span>. Writes are disabled.</span>
          <Button size="sm" variant="secondary" onClick={() => setViewAs(null)}>Exit preview</Button>
        </div>
      ) : (
        !models.isLoading && ownedByMe.length === 0 && topCreator && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-dim">
            <span>This wallet doesn’t own any models yet — mint one, or see what an established creator’s dashboard looks like.</span>
            <Button size="sm" variant="secondary" onClick={() => setViewAs(topCreator)}>Preview a top creator</Button>
          </div>
        )
      )}

      <div className="pt-8">
        {panel === "overview" && <Overview owner={subject} owned={owned} loading={models.isLoading} readOnly={readOnly} />}
        {panel === "split" && <SplitEditor owned={owned} readOnly={readOnly} />}
        {panel === "mint" && <Mint readOnly={readOnly} />}
      </div>
    </div>
  );
}

// ─────────────────────────── overview ───────────────────────────
function Overview({ owner, owned, loading, readOnly }: { owner?: Address; owned: ModelView[]; loading: boolean; readOnly: boolean }) {
  const { chainId, contracts } = useAppChain();
  const ids = owned.map((m) => m.id);
  const pending = usePending(owner);
  const claim = useTxFlow({ chainId, title: "Royalties claimed" });
  const revenue = useChainQuery(["owner-revenue", ids.join(",")], ({ client, c }) => new RpcIndexer(client, c).revenue(ids), { enabled: ids.length > 0 });
  const usage = useChainQuery(["owner-usage", ids.join(",")], ({ client, c }) => new RpcIndexer(client, c).usage({ modelIds: ids }), { enabled: ids.length > 0 });

  if (loading) return <div className="grid gap-4 sm:grid-cols-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;
  if (!owned.length) return <EmptyState title="No models yet" body="Mint your first model NFT to start earning from licenses and pay-per-use calls." />;

  const monthly = bucketByMonth(revenue.data ?? [], (l) => usdNumber(l.data.ownerShare), 6);
  const dayCounts = bucketByDay(usage.data ?? [], (l) => Number(l.data.calls), 168);
  const totalOwnerRevenue = (revenue.data ?? []).reduce((s, l) => s + l.data.ownerShare, 0n);
  const totalCalls = owned.reduce((s, m) => s + m.totalCalls, 0n);
  const slices = owned.map((m, i) => ({ label: m.meta?.name ?? `#${m.id}`, value: usdNumber(m.totalRevenue), color: ["#8b5cf6", "#a78bfa", "#6d28d9", "#38bdf8", "#34d399", "#f59e0b", "#f472b6"][i % 7]! })).filter((s) => s.value > 0);
  const trendFor = (id: number) => bucketByDay((usage.data ?? []).filter((l) => Number(l.data.modelId) === id), (l) => Number(l.data.calls), 14);

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Earned (your share)" value={<CountUp value={usdNumber(totalOwnerRevenue)} format={(n) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />} sub="all-time, from RevenueDistributed" tone="accent" />
        <Stat label="Claimable now" value={formatUsd(pending.data)} sub="pull-payment balance" tone="ok" />
        <Stat label="Models" value={owned.length} sub="ERC-721 owned" />
        <Stat label="API calls" value={<CountUp value={Number(totalCalls)} format={(n) => compact(n)} />} sub="metered on-chain" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-6">
          <Eyebrow>Monthly earnings · last 6 months</Eyebrow>
          <div className="mt-4">{revenue.isLoading ? <Skeleton className="h-56" /> : <LineChart data={monthly} format={(n) => `$${compact(n)}`} ariaLabel="Monthly earnings in dollars" />}</div>
        </Card>
        <Card className="space-y-4 p-6">
          <Eyebrow>Claim royalties</Eyebrow>
          <div className="num font-display text-4xl font-bold">{formatUsd(pending.data)}</div>
          <p className="text-sm text-ink-dim">Revenue accrues to a pull-payment balance. Claiming transfers it in one transaction; nothing is ever pushed to your address.</p>
          <TxStepper steps={claim.steps} status={claim.status} error={claim.error} chainId={chainId} />
          <TxAction size="md" loading={claim.isRunning} disabled={readOnly || !pending.data} disabledReason={readOnly ? "Preview mode is read-only" : "Nothing to claim yet"} onClick={() => contracts && claim.run([{ id: "claim", label: `Claim ${formatUsd(pending.data)}`, exec: async (api) => void (await api.write({ ...contracts.marketplace, functionName: "claim" })) }])}>Claim {formatUsd(pending.data)}</TxAction>
        </Card>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.6fr]">
        <Card className="p-6">
          <Eyebrow>Revenue by model</Eyebrow>
          <div className="mt-4 flex justify-center"><Donut slices={slices} center={formatUsd(owned.reduce((s, m) => s + m.totalRevenue, 0n), { maxFraction: 0 })} sub="gross" /></div>
          <ul className="mt-5 space-y-2 text-sm">{slices.map((s) => <li key={s.label} className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} /><span className="truncate text-ink-dim">{s.label}</span></span><span className="num">${s.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span></li>)}</ul>
        </Card>
        <Card className="p-6">
          <Eyebrow>Inference activity · last 24 weeks</Eyebrow>
          <div className="mt-4">{usage.isLoading ? <Skeleton className="h-40" /> : <Heatmap values={dayCounts} />}</div>
        </Card>
      </div>

      <div>
        <h2 className="mb-4 font-display text-2xl font-semibold">Your models</h2>
        <div className="scroll-thin overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-bg-raised"><tr className="label-mono text-left">{["Model", "Type", "Calls", "Gross revenue", "14-day calls", "Per call", ""].map((h) => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}</tr></thead>
            <tbody>{owned.map((m) => (
              <tr key={m.id} className="border-t border-line-soft">
                <td className="px-4 py-3 font-medium">{m.meta?.name ?? `Model #${m.id}`}<div className="num text-[11px] text-ink-faint">#{m.id} · v{m.version.replace(/^v/, "")}</div></td>
                <td className="px-4 py-3"><Badge tone="mute">{CATEGORIES[m.category]}</Badge></td>
                <td className="num px-4 py-3">{compact(Number(m.totalCalls))}</td>
                <td className="num px-4 py-3">{formatUsd(m.totalRevenue, { maxFraction: 0 })}</td>
                <td className="px-4 py-3"><Sparkline values={trendFor(m.id)} /></td>
                <td className="num px-4 py-3 text-ink-dim">{formatUsd(m.pricing.perCall)}</td>
                <td className="px-4 py-3 text-right"><Link href={`/models/${m.id}`} className="text-accent-hi hover:underline">View →</Link></td>
              </tr>))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── revenue split ───────────────────────────
function SplitEditor({ owned, readOnly }: { owned: ModelView[]; readOnly: boolean }) {
  const { chainId, contracts } = useAppChain();
  const flow = useTxFlow({ chainId, title: "Revenue split updated" });
  const fee = useChainQuery(["platform-fee"], ({ client, c }) => client.readContract({ ...c.marketplace, functionName: "platformFeeBps" }));
  const [id, setId] = useState<number | null>(null);
  const model = owned.find((m) => m.id === (id ?? owned[0]?.id));
  const [partner, setPartner] = useState("");
  const [pct, setPct] = useState(20);
  const platform = fee.data ?? 1000;
  const bps = Math.round(pct * 100);
  const partnerOk = pct === 0 || isAddress(partner);

  if (!owned.length) return <EmptyState title="Mint a model first" body="Revenue splits are configured per model by its current owner." />;
  const owner = 10_000 - platform - (pct === 0 ? 0 : bps);
  const rows = [{ label: "You (model owner)", bps: owner, tone: "bg-accent" }, ...(pct ? [{ label: "Compute partner", bps, tone: "bg-sky-400" }] : []), { label: "NeuralHub treasury", bps: platform, tone: "bg-ink-faint" }];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-5 p-6">
        <Eyebrow>On-chain royalty split</Eyebrow>
        <Field label="Model" htmlFor="split-model"><select id="split-model" value={model?.id} onChange={(e) => setId(Number(e.target.value))} className="h-11 w-full rounded-lg border border-line bg-bg-raised px-3 text-sm outline-none focus:border-accent">{owned.map((m) => <option key={m.id} value={m.id}>{m.meta?.name ?? `Model #${m.id}`}</option>)}</select></Field>
        <Field label="Compute partner address" htmlFor="partner" error={pct > 0 && partner && !isAddress(partner) ? "Not a valid address" : undefined}><Input id="partner" mono placeholder="0x…" value={partner} onChange={(e) => setPartner(e.target.value.trim())} /></Field>
        <div><label htmlFor="pct" className="text-sm text-ink-dim">Partner share: <b className="num text-ink">{pct}%</b> <span className="text-xs text-ink-faint">(max 50% — enforced by the contract)</span></label><input id="pct" type="range" min={0} max={50} step={1} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="mt-2 w-full accent-[#8b5cf6]" /></div>
        <TxStepper steps={flow.steps} status={flow.status} error={flow.error} chainId={chainId} />
        <TxAction size="md" loading={flow.isRunning} disabled={readOnly || !partnerOk || !model} disabledReason={readOnly ? "Preview mode is read-only" : "Enter a valid partner address"} onClick={() => model && contracts && flow.run([{ id: "split", label: "Save revenue split", exec: async (api) => void (await api.write({ ...contracts.marketplace, functionName: "setRevenueSplit", args: [BigInt(model.id), pct === 0 ? "0x0000000000000000000000000000000000000000" : (partner as Address), bps] })) }])}>Save split on-chain</TxAction>
      </Card>
      <Card className="space-y-5 p-6">
        <Eyebrow>Preview of every $100 earned</Eyebrow>
        {rows.map((r) => (
          <div key={r.label}>
            <div className="mb-1.5 flex justify-between text-sm"><span>{r.label}</span><span className="num">{bpsToPct(r.bps)} · ${(r.bps / 100).toFixed(2)}</span></div>
            <div className="h-2.5 overflow-hidden rounded-full bg-bg"><div className={`h-full rounded-full transition-[width] duration-500 ${r.tone}`} style={{ width: `${r.bps / 100}%` }} /></div>
          </div>
        ))}
        {model && model.split.partnerBps > 0 && <p className="text-xs text-ink-faint">Current on-chain: {bpsToPct(model.split.partnerBps)} to {shortAddress(model.split.partner)}.</p>}
      </Card>
    </div>
  );
}

// ─────────────────────────── mint & list wizard ───────────────────────────
const STEPS = ["Details", "Pricing", "Review & publish"] as const;

function placeholderArt(name: string) {
  const hue = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 80% 55%)"/><stop offset="1" stop-color="hsl(${(hue + 70) % 360} 70% 20%)"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><circle cx="200" cy="200" r="90" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2"/><circle cx="200" cy="200" r="40" fill="#fff" fill-opacity=".18"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function Mint({ readOnly }: { readOnly: boolean }) {
  const { chainId, contracts } = useAppChain();
  const flow = useTxFlow({ chainId, title: "Model minted & listed" });
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ name: "", description: "", handle: "", category: 0, framework: "PyTorch", version: "1.0.0", royalty: 5, personal: "99", commercial: "499", enterprise: "2499", perCall: "0.02" });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const prices = { personal: parseAmount(f.personal, PAYMENT_DECIMALS), commercial: parseAmount(f.commercial, PAYMENT_DECIMALS), enterprise: parseAmount(f.enterprise, PAYMENT_DECIMALS), perCall: parseAmount(f.perCall, PAYMENT_DECIMALS) };
  const detailsOk = f.name.trim().length >= 3 && /^\d+\.\d+\.\d+$/.test(f.version);
  const pricingOk = Object.values(prices).every((p) => !p.error);

  const publish = async () => {
    if (!contracts) return;
    let uri = "";
    let mintedId = 0n;
    await flow.run([
      {
        id: "pin", label: "Pin metadata (IPFS / data URI)",
        exec: async () => {
          const res = await fetch("/api/ipfs/pin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: f.name.trim(), description: f.description.trim(), image: placeholderArt(f.name), neuralhub: { handle: f.handle.trim() || "anonymous", framework: f.framework, params: "—", tags: [CATEGORIES[f.category]!.toLowerCase()], rating: 0, benchmarks: [] } }) });
          if (res.status === 401) throw new Error("Sign in with your wallet first (Console → Sign in) so the pin endpoint can authenticate you.");
          if (!res.ok) throw new Error("Could not pin metadata");
          uri = ((await res.json()) as { uri: string }).uri;
        },
      },
      {
        id: "mint", label: "Mint model NFT (ERC-721)",
        exec: async (api) => {
          const { receipt } = await api.write({ ...contracts.modelNFT, functionName: "mintModel", args: [uri, f.category, f.version, BigInt(Math.round(f.royalty * 100))] });
          const log = parseEventLogs({ abi: contracts.modelNFT.abi, logs: receipt.logs, eventName: "ModelMinted" })[0];
          if (!log) throw new Error("Mint succeeded but the token id could not be read");
          mintedId = log.args.modelId;
        },
      },
      {
        id: "list", label: "List with pricing",
        exec: async (api) => void (await api.write({ ...contracts.marketplace, functionName: "listModel", args: [mintedId, { personal: prices.personal.value!, commercial: prices.commercial.value!, enterprise: prices.enterprise.value!, perCall: prices.perCall.value!, listed: true }] })),
      },
    ]);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <ol className="mb-8 flex items-center gap-3" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-3" aria-current={i === step ? "step" : undefined}>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-xs ${i <= step ? "border-accent bg-accent text-white" : "border-line text-ink-faint"}`}>{i + 1}</span>
            <span className={`hidden text-sm sm:block ${i === step ? "text-ink" : "text-ink-faint"}`}>{s}</span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-line" />}
          </li>
        ))}
      </ol>
      <Card className="space-y-5 p-6">
        {step === 0 && (
          <>
            <Field label="Model name" htmlFor="m-name" error={f.name && f.name.trim().length < 3 ? "At least 3 characters" : undefined}><Input id="m-name" value={f.name} maxLength={120} onChange={(e) => set("name", e.target.value)} placeholder="Aura-Llama-70B" /></Field>
            <Field label="Description" htmlFor="m-desc"><Textarea id="m-desc" rows={3} value={f.description} maxLength={2000} onChange={(e) => set("description", e.target.value)} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category" htmlFor="m-cat"><select id="m-cat" value={f.category} onChange={(e) => set("category", Number(e.target.value))} className="h-11 w-full rounded-lg border border-line bg-bg-raised px-3 text-sm outline-none focus:border-accent">{CATEGORIES.map((c, i) => <option key={c} value={i}>{c}</option>)}</select></Field>
              <Field label="Creator handle" htmlFor="m-handle"><Input id="m-handle" value={f.handle} maxLength={40} onChange={(e) => set("handle", e.target.value)} placeholder="yourname" /></Field>
              <Field label="Version (semver)" htmlFor="m-ver" error={f.version && !/^\d+\.\d+\.\d+$/.test(f.version) ? "Use x.y.z" : undefined}><Input id="m-ver" mono value={f.version} onChange={(e) => set("version", e.target.value)} /></Field>
              <Field label="Secondary royalty (ERC-2981)" htmlFor="m-roy" hint="Max 10%"><Input id="m-roy" mono type="number" min={0} max={10} step={0.5} value={f.royalty} onChange={(e) => set("royalty", Math.min(10, Math.max(0, Number(e.target.value))))} suffix="%" /></Field>
            </div>
          </>
        )}
        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {([["personal", "Personal license"], ["commercial", "Commercial license"], ["enterprise", "Enterprise license"], ["perCall", "Per API call"]] as const).map(([k, label]) => (
              <Field key={k} label={`${label} (USD)`} htmlFor={`p-${k}`} error={f[k] ? prices[k].error : undefined}><Input id={`p-${k}`} mono inputMode="decimal" value={f[k]} onChange={(e) => set(k, e.target.value)} suffix="NHUSD" /></Field>
            ))}
          </div>
        )}
        {step === 2 && (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-ink-faint">Name</dt><dd className="text-right">{f.name}</dd>
              <dt className="text-ink-faint">Category</dt><dd className="text-right">{CATEGORIES[f.category]}</dd>
              <dt className="text-ink-faint">Version</dt><dd className="num text-right">{f.version}</dd>
              <dt className="text-ink-faint">Royalty</dt><dd className="num text-right">{f.royalty}%</dd>
              <dt className="text-ink-faint">Licenses</dt><dd className="num text-right">${f.personal} / ${f.commercial} / ${f.enterprise}</dd>
              <dt className="text-ink-faint">Per call</dt><dd className="num text-right">${f.perCall}</dd>
            </dl>
            <p className="text-xs text-ink-faint">Three steps, three wallet interactions: pin metadata (needs a signed-in session), mint the ERC-721, then list it. Each is simulated first.</p>
            <TxStepper steps={flow.steps} status={flow.status} error={flow.error} chainId={chainId} />
            {flow.status === "success" && <Button href="/explore" variant="secondary" className="w-full">See it in the marketplace →</Button>}
          </>
        )}
        <div className="flex justify-between gap-3 pt-2">
          <Button variant="ghost" disabled={step === 0 || flow.isRunning} onClick={() => setStep(step - 1)}>Back</Button>
          {step < 2 ? <Button disabled={step === 0 ? !detailsOk : !pricingOk} onClick={() => setStep(step + 1)}>Continue</Button>
            : <TxAction full={false} size="md" loading={flow.isRunning} disabled={readOnly || flow.status === "success"} disabledReason={readOnly ? "Preview mode is read-only" : undefined} onClick={publish}>Mint &amp; list</TxAction>}
        </div>
      </Card>
    </div>
  );
}
