"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { HeroNetwork } from "@/components/motion/HeroNetwork";
import { SplitHeading } from "@/components/motion/SplitHeading";
import { Reveal } from "@/components/motion/Reveal";
import { CountUp } from "@/components/motion/CountUp";
import { Button } from "@/components/ui/Button";
import { Badge, Card, Eyebrow, Skeleton } from "@/components/ui/Card";
import { ModelCard } from "@/components/nft/ModelCard";
import { useModelViews } from "@/features/models/hooks";
import { useFeed } from "@/lib/store/feed";
import { CATEGORIES } from "@/lib/web3/contracts";
import { usdNumber, compact, shortAddress } from "@/lib/web3/format";
import { useUi } from "@/lib/store/ui";
import { cn } from "@/lib/utils";

const STANDARDS = [
  { tag: "ERC-20", title: "NHUSD · payments", body: "Stablecoin checkout with EIP-2612 permit: approve and pay in a single signature.", points: ["Faucet & transfers", "Exact / permit / unlimited approvals", "Allowance risk checks"] },
  { tag: "ERC-721", title: "Models · identity", body: "Every model is an NFT with creator, version, metadata URI and ERC-2981 royalties. Own the NFT, own the revenue.", points: ["Mint & list wizard", "Ownership history timeline", "Revenue follows the owner"] },
  { tag: "ERC-1155", title: "Licenses · access", body: "Personal, Commercial and Enterprise licenses (plus plan passes) as semi-fungible tokens with on-chain expiry.", points: ["Live validity & expiry", "Transferable with expiry", "Batch-friendly"] },
];

const STEPS = [
  ["01", "Select a model", "Browse verified models minted on-chain. Every card is an ERC-721 you can inspect."],
  ["02", "Acquire a license", "Pay in NHUSD. An ERC-1155 license is minted to your wallet in the same transaction."],
  ["03", "Deploy & meter", "Call the gateway API. Usage is settled on-chain and royalties stream to creators."],
] as const;

export function Landing() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const setFilters = useUi((s) => s.setFilters);
  const { views, isLoading } = useModelViews();
  const feed = useFeed((s) => s.items);

  const trending = useMemo(() => [...views].sort((a, b) => Number(b.totalCalls - a.totalCalls)).slice(0, 6), [views]);
  const totals = useMemo(() => ({
    models: views.length,
    calls: views.reduce((s, v) => s + Number(v.totalCalls), 0),
    revenue: views.reduce((s, v) => s + usdNumber(v.totalRevenue), 0),
  }), [views]);

  const go = (e: React.FormEvent) => { e.preventDefault(); setFilters({ query: q }); router.push(`/explore?q=${encodeURIComponent(q)}`); };

  return (
    <>
      {/* ───────────── hero ───────────── */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 pb-16 pt-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pt-24">
          <div>
            <Badge className="px-3 py-1">AI model marketplace · secured on-chain</Badge>
            <SplitHeading className="mt-6 font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              Own, deploy, and monetize the world&apos;s finest AI models
            </SplitHeading>
            <p className="mt-6 max-w-xl text-lg text-ink-dim">Decentralized compute meets cryptographic ownership. License models as tokens, pay per call, and watch royalties settle on-chain in real time.</p>
            <form onSubmit={go} className="mt-8 flex max-w-xl items-center gap-2 rounded-xl border border-line bg-surface p-1.5 focus-within:border-accent">
              <label htmlFor="hero-search" className="sr-only">Search models</label>
              <input id="hero-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search models by name, tag or category…" className="min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-sm outline-none placeholder:text-ink-faint" />
              <Button size="md" type="submit">Execute query</Button>
            </form>
            <div className="mt-5 flex flex-wrap gap-2">
              {CATEGORIES.slice(0, 6).map((c, i) => (
                <button key={c} onClick={() => { setFilters({ category: i }); router.push("/explore"); }} className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs text-ink-dim transition hover:border-accent/60 hover:text-ink">{c}</button>
              ))}
            </div>
          </div>
          <HeroNetwork className="mx-auto w-full max-w-[560px]" />
        </div>

        {/* live stat strip */}
        <div className="border-y border-line-soft bg-bg-raised/60">
          <div className="mx-auto grid max-w-7xl grid-cols-3 gap-4 px-4 py-6 sm:px-6">
            {[
              ["Models on-chain", totals.models, (n: number) => Math.round(n).toString()],
              ["API calls settled", totals.calls, (n: number) => compact(n)],
              ["Protocol volume", totals.revenue, (n: number) => `$${compact(n)}`],
            ].map(([label, value, fmt]) => (
              <div key={label as string} className="text-center">
                <div className="label-mono">{label as string}</div>
                <div className="mt-1 font-display text-2xl font-bold sm:text-4xl">{isLoading ? <Skeleton className="mx-auto h-9 w-20" /> : <CountUp value={value as number} format={fmt as (n: number) => string} />}</div>
              </div>
            ))}
          </div>
          <LiveTicker items={feed} />
        </div>
      </section>

      {/* ───────────── trending ───────────── */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <Reveal>
          <Eyebrow>Decision engines</Eyebrow>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl font-bold sm:text-4xl">Trending models on-chain</h2>
              <p className="mt-2 text-ink-dim">Ranked by metered API calls, straight from the marketplace contract.</p>
            </div>
            <Button variant="secondary" href="/explore">View all models →</Button>
          </div>
        </Reveal>
        <Reveal stagger={0.08} className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-52" />) : trending.map((m) => <div key={m.id} data-reveal-item><ModelCard model={m} /></div>)}
        </Reveal>
        {!isLoading && !trending.length && <p className="mt-6 text-ink-dim">No models on this network yet. Run <code className="num">pnpm deploy:local</code> to seed the catalogue.</p>}
      </section>

      {/* ───────────── how it works ───────────── */}
      <section className="border-y border-line-soft bg-bg-raised/40 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal className="text-center">
            <Eyebrow>Decentralized architecture</Eyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">How NeuralHub orchestrates ownership</h2>
          </Reveal>
          <Reveal stagger={0.12} className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map(([n, t, b]) => (
              <Card key={n} data-reveal-item className="p-7">
                <div className="num text-3xl font-bold text-accent-hi">{n}</div>
                <h3 className="mt-4 font-display text-xl font-semibold">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-dim">{b}</p>
              </Card>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ───────────── token standards ───────────── */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <Reveal>
          <Eyebrow>One protocol · three standards</Eyebrow>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold sm:text-4xl">Every token standard has a job in the product</h2>
        </Reveal>
        <Reveal stagger={0.1} className="mt-10 grid gap-5 md:grid-cols-3">
          {STANDARDS.map((s, i) => (
            <Card key={s.tag} data-reveal-item highlight={i === 1} className="flex flex-col p-6">
              <Badge className="self-start">{s.tag}</Badge>
              <h3 className="mt-4 font-display text-xl font-semibold">{s.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-dim">{s.body}</p>
              <ul className="mt-5 space-y-1.5 text-sm">{s.points.map((p) => <li key={p} className="flex gap-2"><span className="text-ok">✓</span>{p}</li>)}</ul>
            </Card>
          ))}
        </Reveal>
        <Reveal className="mt-8 flex justify-center"><Button href="/assets" variant="secondary">Try the token playground →</Button></Reveal>
      </section>

      {/* ───────────── CTA ───────────── */}
      <Reveal as="section" className="mx-auto max-w-4xl px-4 pb-8 text-center sm:px-6">
        <h2 className="font-display text-4xl font-extrabold sm:text-5xl">Unleash cryptographic AI weights</h2>
        <p className="mx-auto mt-4 max-w-xl text-ink-dim">Connect your wallet, grab test NHUSD from the faucet, and mint your first license in under a minute.</p>
        <div className="mt-8 flex justify-center gap-3"><Button size="lg" magnetic href="/explore">Explore models</Button><Button size="lg" variant="secondary" href="/dashboard">Publish a model</Button></div>
      </Reveal>
    </>
  );
}

function LiveTicker({ items }: { items: ReturnType<typeof useFeed.getState>["items"] }) {
  return (
    <div className="border-t border-line-soft" aria-label="Live on-chain activity">
      <div className="mx-auto flex max-w-7xl items-center gap-3 overflow-hidden px-4 py-2.5 font-mono text-xs sm:px-6">
        <span className="flex shrink-0 items-center gap-2 text-ok"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" />LIVE</span>
        {items.length === 0 ? <span className="text-ink-faint">Waiting for on-chain activity… make a purchase or run an API call to see it here.</span> : (
          <ul className="flex gap-8 overflow-hidden whitespace-nowrap">{items.slice(0, 4).map((i) => <li key={i.id} className={cn("text-ink-dim")}>{i.text} <span className="text-ink-faint">· {shortAddress(i.hash, 6, 4)}</span></li>)}</ul>
        )}
      </div>
    </div>
  );
}
