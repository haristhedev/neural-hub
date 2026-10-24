"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { Badge, Card, Eyebrow, Skeleton } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { ModelNftCard } from "@/components/nft/ModelNftCard";
import { OwnershipHistory } from "@/components/nft/OwnershipHistory";
import { CountUp } from "@/components/motion/CountUp";
import { Reveal } from "@/components/motion/Reveal";
import { gsap, useGSAP, motion } from "@/lib/motion/gsap";
import { CheckoutModal, type Order } from "@/features/checkout/CheckoutModal";
import { useModelViews, useModel, useModelMetadata, type ModelView } from "@/features/models/hooks";
import { useModelLicenses } from "@/features/account/hooks";
import { useChainQuery } from "@/hooks/useChainQuery";
import { useAppChain } from "@/hooks/useAppChain";
import { CATEGORIES, PAYMENT_SYMBOL, TIERS, type TierId } from "@/lib/web3/contracts";
import { compact, formatDate, formatUsd, shortAddress, usdNumber } from "@/lib/web3/format";
import { toGatewayUrls } from "@/lib/web3/ipfs";
import { cn } from "@/lib/utils";

type TabId = "overview" | "performance" | "api" | "ownership";

export function ModelDetail({ id }: { id: number }) {
  const record = useModel(id);
  const metaQ = useModelMetadata(record.data?.tokenURI);
  const all = useModelViews();
  const [tab, setTab] = useState<TabId>("overview");

  if (record.isLoading) return <div className="mx-auto max-w-7xl space-y-6 px-4 py-16 sm:px-6"><Skeleton className="h-10 w-1/3" /><Skeleton className="h-64" /></div>;
  if (record.isError || !record.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
        <h1 className="font-display text-3xl font-bold">Model not found</h1>
        <p className="mt-2 text-ink-dim">Model #{id} does not exist on this network.</p>
        <Button className="mt-6" href="/explore">Back to explore</Button>
      </div>
    );
  }
  const model: ModelView = { ...record.data, meta: metaQ.data, metaLoading: metaQ.isLoading };
  const m = model.meta;
  const related = all.views.filter((v) => v.id !== id).sort((a, b) => Number(v2(b, model) - v2(a, model))).slice(0, 2);

  return (
    <div>
      <section className="border-b border-line-soft">
        <div className="mx-auto max-w-7xl px-4 pb-10 pt-12 sm:px-6">
          <div className="flex flex-wrap items-center gap-3"><Badge className="px-3 py-1">{CATEGORIES[model.category]} · {m?.neuralhub.framework ?? "—"}</Badge><span className="num text-xs text-ink-faint">TOKEN #{model.id} · {shortAddress(model.tokenURI.startsWith("data:") ? "data:on-chain" : model.tokenURI, 14, 6)}</span></div>
          <h1 className="mt-5 font-display text-5xl font-extrabold tracking-tight sm:text-6xl">{m?.name ?? (metaQ.isLoading ? "Loading…" : `Model #${model.id}`)}</h1>
          <p className="mt-4 max-w-3xl text-lg text-ink-dim">{m?.description}</p>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
            <p className="text-sm text-ink-dim">by <span className="font-medium text-accent-hi">@{m?.neuralhub.handle ?? shortAddress(model.creator)}</span> · Released {formatDate(model.createdAt)} · Owner <span className="num">{shortAddress(model.owner)}</span></p>
            <div className="flex divide-x divide-line rounded-2xl border border-line bg-surface">
              {[["API calls", <CountUp key="c" value={Number(model.totalCalls)} format={(n) => compact(n)} />], ["Rating", <span key="r"><span className="text-warn">★</span> {m?.neuralhub.rating.toFixed(1) ?? "—"}</span>], ["Version", model.version]].map(([l, v]) => (
                <div key={l as string} className="px-5 py-3 text-center"><div className="label-mono">{l as string}</div><div className="num mt-1 text-xl font-bold">{v as React.ReactNode}</div></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <Tabs<TabId> value={tab} onChange={setTab} tabs={[{ id: "overview", label: "Overview" }, { id: "performance", label: "Performance & benchmarks" }, { id: "api", label: "API integration" }, { id: "ownership", label: "Ownership" }]} />
          <div className="pt-8" role="tabpanel">
            {tab === "overview" && <Overview model={model} />}
            {tab === "performance" && <Performance model={model} />}
            {tab === "api" && <ApiTab model={model} />}
            {tab === "ownership" && (
              <div className="space-y-8">
                <ModelNftCard model={model} />
                <div><h3 className="mb-4 font-display text-xl font-semibold">Ownership history</h3><OwnershipHistory modelId={model.id} /></div>
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-8 lg:sticky lg:top-24 lg:self-start">
          <LicensePanel model={model} />
          {related.length > 0 && (
            <div>
              <div className="label-mono mb-3">Related computational models</div>
              <div className="space-y-3">{related.map((r) => (
                <Link key={r.id} href={`/models/${r.id}`} className="flex items-center justify-between rounded-xl border border-line bg-surface p-4 transition hover:border-accent/60">
                  <div><div className="text-sm font-semibold">{r.meta?.name ?? `Model #${r.id}`}</div><div className="num text-xs text-ink-dim">{formatUsd(r.pricing.commercial, { maxFraction: 0 })}</div></div><span aria-hidden>→</span>
                </Link>))}</div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

const v2 = (a: ModelView, ref: ModelView) => (a.category === ref.category ? 1_000_000_000n : 0n) + a.totalCalls;

// ───────────────────────────── tabs ─────────────────────────────
function Overview({ model }: { model: ModelView }) {
  const m = model.meta;
  const weights = m?.neuralhub.weights;
  let gateway: string | undefined;
  try { gateway = weights ? toGatewayUrls(weights)[0] : undefined; } catch { gateway = undefined; }
  const scheme = model.tokenURI.split(":")[0];
  return (
    <Reveal stagger={0.1} className="space-y-8">
      <div data-reveal-item>
        <h2 className="font-display text-2xl font-semibold">Model capabilities &amp; use cases</h2>
        <p className="mt-3 leading-relaxed text-ink-dim">{m?.description}</p>
        <div className="mt-4 flex flex-wrap gap-2">{m?.neuralhub.tags.map((t) => <span key={t} className="num rounded-md border border-line bg-surface px-2.5 py-1 text-xs text-ink-dim">{t}</span>)}</div>
      </div>
      <Card data-reveal-item className="p-6">
        <Eyebrow>Core advantages</Eyebrow>
        <ul className="mt-4 space-y-3">
          {["Verified weights: license NFTs prove original authorship on-chain", "Decentralized run capability: usage is metered and settled by smart contract", "Royalties stream automatically to the current NFT owner and compute partner"].map((t) => (
            <li key={t} className="flex gap-3 text-sm"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />{t}</li>
          ))}
        </ul>
      </Card>
      <Card data-reveal-item className="p-6">
        <Eyebrow>Decentralized storage</Eyebrow>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-ink-faint">Metadata</dt><dd className="num text-right">{scheme === "data" ? "on-chain data: URI" : scheme === "ipfs" ? "IPFS" : scheme === "ar" ? "Arweave" : scheme}</dd>
          <dt className="text-ink-faint">Weights</dt><dd className="num min-w-0 truncate text-right">{weights ? (gateway ? <a className="text-accent-hi hover:underline" href={gateway} target="_blank" rel="noopener noreferrer" title={weights}>{weights.slice(0, 28)}… ↗</a> : weights) : "—"}</dd>
        </dl>
        <p className="mt-3 text-xs text-ink-faint">ipfs:// and ar:// URIs resolve through ordered public gateways with timeouts and fallbacks (see <code className="num">lib/web3/ipfs.ts</code>).</p>
      </Card>
    </Reveal>
  );
}

function Performance({ model }: { model: ModelView }) {
  const root = useRef<HTMLDivElement>(null);
  const rows = model.meta?.neuralhub.benchmarks ?? [];
  useGSAP(() => { motion(() => { gsap.from(root.current!.querySelectorAll("[data-fill]"), { scaleX: 0, transformOrigin: "left", duration: 1.1, stagger: 0.12, ease: "power3.out" }); }); }, { scope: root, dependencies: [rows.length] });
  if (!rows.length) return <p className="text-ink-dim">No benchmarks published yet.</p>;
  return (
    <div ref={root} className="space-y-6">
      <h2 className="font-display text-2xl font-semibold">Benchmark reference</h2>
      <div className="overflow-x-auto rounded-2xl border border-line scroll-thin">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-bg-raised"><tr className="label-mono text-left">{["Dataset", "Score", "Latency", "Fidelity"].map((h) => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.dataset} className="border-t border-line-soft">
              <td className="px-4 py-3 font-medium">{r.dataset}</td><td className="num px-4 py-3 text-ink-dim">{r.score}</td><td className="num px-4 py-3 text-ink-dim">{r.latencyMs}ms</td>
              <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="h-1.5 w-28 overflow-hidden rounded-full bg-bg"><div data-fill className="h-full rounded-full bg-ok" style={{ width: `${r.fidelity}%` }} /></div><span className="num text-ok">{r.fidelity}%</span></div></td>
            </tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}

function ApiTab({ model }: { model: ModelView }) {
  const [lang, setLang] = useState<"python" | "javascript" | "curl">("python");
  const [calls, setCalls] = useState(10_000);
  const { chainId } = useAppChain();
  const perCall = usdNumber(model.pricing.perCall);
  const commercial = usdNumber(model.pricing.commercial);
  const breakEven = perCall > 0 ? Math.ceil(commercial / perCall) : 0;
  const origin = typeof window !== "undefined" ? window.location.origin : "https://neuralhub.example";
  const snippets = {
    python: `import requests\n\nres = requests.post(\n    "${origin}/api/gateway/infer",\n    cookies={"nh_session": SESSION},   # from wallet sign-in\n    json={"chainId": ${chainId}, "modelId": ${model.id}, "calls": 1,\n          "prompt": "hello"},\n)\nprint(res.json()["output"])`,
    javascript: `const res = await fetch("/api/gateway/infer", {\n  method: "POST",\n  headers: { "content-type": "application/json" },\n  credentials: "include",            // wallet-login session cookie\n  body: JSON.stringify({ chainId: ${chainId}, modelId: ${model.id}, calls: 1, prompt: "hello" }),\n});\nconst { output, txHash, cost } = await res.json();`,
    curl: `curl -X POST ${origin}/api/gateway/infer \\\n  -H 'content-type: application/json' \\\n  -b 'nh_session=$SESSION' \\\n  -d '{"chainId":${chainId},"modelId":${model.id},"calls":1,"prompt":"hello"}'`,
  };
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-2xl font-semibold">On-chain compute API</h2>
        <p className="mt-2 text-ink-dim">Pay-per-use: each call debits your prepaid credits at <b className="num text-ink">{formatUsd(model.pricing.perCall)}</b>, settled on-chain by the gateway. Unused credits are withdrawable any time.</p>
      </div>
      <Card className="overflow-hidden">
        <div className="flex border-b border-line">{(["python", "javascript", "curl"] as const).map((l) => <button key={l} onClick={() => setLang(l)} className={cn("px-4 py-3 font-mono text-xs", lang === l ? "border-b-2 border-accent text-ink" : "text-ink-dim hover:text-ink")}>{l}</button>)}</div>
        <pre className="scroll-thin overflow-x-auto bg-bg p-5 font-mono text-[13px] leading-relaxed text-ink-dim"><code>{snippets[lang]}</code></pre>
      </Card>
      <Card className="p-6">
        <Eyebrow>Cost estimator</Eyebrow>
        <label htmlFor="calls" className="mt-4 block text-sm text-ink-dim">Calls per month: <b className="num text-ink">{calls.toLocaleString()}</b></label>
        <input id="calls" type="range" min={100} max={500_000} step={100} value={calls} onChange={(e) => setCalls(Number(e.target.value))} className="mt-2 w-full accent-[#8b5cf6]" />
        <div className="mt-4 grid grid-cols-3 gap-4 text-center">
          <div><div className="label-mono">Pay-per-use</div><div className="num mt-1 text-xl font-bold">${(calls * perCall).toLocaleString("en-US", { maximumFractionDigits: 2 })}</div></div>
          <div><div className="label-mono">Commercial license</div><div className="num mt-1 text-xl font-bold">${commercial.toLocaleString()}</div></div>
          <div><div className="label-mono">Break-even</div><div className="num mt-1 text-xl font-bold">{breakEven.toLocaleString()} calls</div></div>
        </div>
        <p className="mt-4 text-center text-sm text-ink-dim">{calls * perCall > commercial ? "At this volume a license is cheaper than metering." : "At this volume pay-per-use is cheaper than a license."}</p>
      </Card>
      <Button href={`/console?model=${model.id}`} variant="secondary">Try it in the API console →</Button>
    </div>
  );
}

// ───────────────────────────── license panel ─────────────────────────────
function LicensePanel({ model }: { model: ModelView }) {
  const { address } = useAccount();
  const { contracts } = useAppChain();
  const held = useModelLicenses(model.id, address);
  const fee = useChainQuery(["platform-fee"], ({ client, c }) => client.readContract({ ...c.marketplace, functionName: "platformFeeBps" }));
  const [tier, setTier] = useState<TierId>(2);
  const [open, setOpen] = useState(false);

  const price = (t: TierId) => model.pricing[TIERS.find((x) => x.id === t)!.key];
  const owned = held.data?.find((h) => h.tier === tier);

  const order = useMemo<Order | null>(() => {
    if (!contracts) return null;
    const amount = price(tier);
    const platformBps = fee.data ?? 1000;
    const partnerBps = model.split.partnerBps;
    const t = TIERS.find((x) => x.id === tier)!;
    return {
      title: `${t.label} license · ${model.meta?.name ?? `Model #${model.id}`}`,
      subtitle: `${t.blurb}. Mints an ERC-1155 license token to your wallet.`,
      badge: `${t.label.toUpperCase()} LICENSE`,
      amount,
      lines: [["License price", formatUsd(amount)], ["Network fee", "paid in gas"]].map(([label, value]) => ({ label: label!, value: value! })),
      split: [
        { label: `Model owner @${model.meta?.neuralhub.handle ?? shortAddress(model.owner)}`, bps: 10_000 - platformBps - (partnerBps ? partnerBps : 0) },
        ...(partnerBps ? [{ label: `Compute partner ${shortAddress(model.split.partner)}`, bps: partnerBps }] : []),
        { label: "NeuralHub treasury", bps: platformBps },
      ],
      cta: "Mint ERC-1155 license & pay now",
      actionLabel: "Purchase license",
      action: { ...contracts.marketplace, functionName: "buyLicense", args: [BigInt(model.id), tier] },
      actionWithPermit: (s) => ({ ...contracts.marketplace, functionName: "buyLicenseWithPermit", args: [BigInt(model.id), tier, s.deadline, s.v, s.r, s.s] }),
      cardNote: "In production the PSP webhook would trigger a custodial mint of this license to your wallet.",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts, tier, model, fee.data]);

  return (
    <Card highlight className="p-6">
      <Eyebrow>Licensing plans</Eyebrow>
      <div className="mt-4 space-y-2" role="radiogroup" aria-label="License tier">
        {TIERS.map((t) => {
          const p = price(t.id);
          const mine = held.data?.find((h) => h.tier === t.id);
          return (
            <button key={t.id} role="radio" aria-checked={tier === t.id} onClick={() => setTier(t.id)} className={cn("flex w-full items-center justify-between rounded-xl border p-3.5 text-left transition", tier === t.id ? "border-accent bg-accent-lo/40" : "border-line hover:border-accent/40")}>
              <span><span className="flex items-center gap-2 text-sm font-semibold">{t.label}{mine && <Badge tone={mine.valid ? "ok" : "bad"}>{mine.valid ? "owned" : "expired"}</Badge>}</span><span className="block text-xs text-ink-dim">{t.blurb}</span></span>
              <span className="num text-lg font-bold">{formatUsd(p, { maxFraction: 0 })}</span>
            </button>
          );
        })}
      </div>
      <dl className="mt-5 space-y-2 border-t border-line-soft pt-4 text-sm">
        <div className="flex justify-between"><dt className="text-ink-dim">API inference call</dt><dd className="num font-semibold">{formatUsd(model.pricing.perCall)} / call</dd></div>
        <div className="flex justify-between"><dt className="text-ink-dim">Payment token</dt><dd className="num text-ok">{PAYMENT_SYMBOL}</dd></div>
        {owned && <div className="flex justify-between"><dt className="text-ink-dim">Your license</dt><dd className="num">{owned.expiresAt === 0 ? "Perpetual" : `until ${formatDate(owned.expiresAt)}`}</dd></div>}
      </dl>
      <Button size="lg" className="mt-5 w-full" magnetic onClick={() => setOpen(true)} disabled={!order || !model.pricing.listed}>{owned?.valid ? "Renew / extend license" : "Acquire license"}</Button>
      <Button size="lg" variant="secondary" className="mt-3 w-full" href={`/console?model=${model.id}`}>Try interactive demo</Button>
      <CheckoutModal open={open} onClose={() => setOpen(false)} order={order} />
    </Card>
  );
}
