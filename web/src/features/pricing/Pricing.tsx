"use client";
import { useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { Badge, Card, Eyebrow } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Field";
import { Reveal } from "@/components/motion/Reveal";
import { gsap, useGSAP, motion, EASE } from "@/lib/motion/gsap";
import { CheckoutModal, type Order } from "@/features/checkout/CheckoutModal";
import { usePlanPass } from "@/features/account/hooks";
import { useChainQuery } from "@/hooks/useChainQuery";
import { useAppChain } from "@/hooks/useAppChain";
import { PLANS, type PlanId } from "@/lib/web3/contracts";
import { formatDate, formatUsd } from "@/lib/web3/format";
import { cn } from "@/lib/utils";

const MATRIX: { feature: string; free: string | boolean; pro: string | boolean; team: string | boolean; ent: string | boolean }[] = [
  { feature: "Monthly API calls", free: "500", pro: "10,000", team: "50,000", ent: "Custom" },
  { feature: "Verified model access", free: "Community", pro: "Unlimited", team: "Unlimited", ent: "Unlimited" },
  { feature: "On-chain usage receipts", free: true, pro: true, team: true, ent: true },
  { feature: "Live analytics telemetry", free: false, pro: true, team: true, ent: true },
  { feature: "Team workspace & roles", free: false, pro: false, team: true, ent: true },
  { feature: "SSO & custody keys", free: false, pro: false, team: true, ent: true },
  { feature: "Dedicated compute + SLA", free: false, pro: false, team: false, ent: true },
];

const FAQ = [
  ["How do plan passes work on-chain?", "Subscribing mints an ERC-1155 pass (model id 0) to your wallet. Its expiry is stored on-chain, so any app can verify your plan without asking us."],
  ["Can I pay with a card instead?", "Yes. The checkout offers a card tab (simulated in this demo). In production a PSP webhook triggers a custodial mint of the same pass."],
  ["What does the NHUSD permit do?", "EIP-2612 lets you authorize the exact amount with a free signature, so a subscription is one transaction instead of approve + subscribe."],
  ["What happens when a plan expires?", "The pass stays in your wallet but reads as expired. Re-subscribing extends the existing expiry rather than resetting it."],
];

export function Pricing() {
  const [annual, setAnnual] = useState(false);
  const [selected, setSelected] = useState<PlanId | null>(null);
  const [open, setOpen] = useState(false);
  const [faq, setFaq] = useState<number | null>(0);
  const { address } = useAccount();
  const { contracts } = useAppChain();
  const pass = usePlanPass(address);
  const prices = useChainQuery(["plan-prices"], async ({ client, c }) => {
    const [pm, py, tm, ty] = await Promise.all([
      client.readContract({ ...c.marketplace, functionName: "planPrice", args: [1, false] }),
      client.readContract({ ...c.marketplace, functionName: "planPrice", args: [1, true] }),
      client.readContract({ ...c.marketplace, functionName: "planPrice", args: [2, false] }),
      client.readContract({ ...c.marketplace, functionName: "planPrice", args: [2, true] }),
    ]);
    return { 1: { month: pm, year: py }, 2: { month: tm, year: ty } } as const;
  });

  const price = (p: PlanId) => (annual ? prices.data?.[p].year : prices.data?.[p].month);

  const order = useMemo<Order | null>(() => {
    if (!contracts || !selected) return null;
    const amount = price(selected);
    if (amount === undefined) return null;
    const plan = PLANS[selected];
    return {
      title: `${plan.name} plan · ${annual ? "annual" : "monthly"}`,
      subtitle: `${plan.tagline}. Mints an ERC-1155 plan pass valid for ${annual ? "12 months" : "30 days"}.`,
      badge: `${plan.name.toUpperCase()} PLAN`,
      amount,
      lines: [{ label: "Billing", value: annual ? "Annual (20% off)" : "Monthly" }, { label: "Subtotal", value: formatUsd(amount) }],
      split: [{ label: "NeuralHub treasury", bps: 10_000 }],
      cta: "Subscribe & mint plan pass",
      actionLabel: "Subscribe",
      action: { ...contracts.marketplace, functionName: "subscribe", args: [selected, annual] },
      actionWithPermit: (s) => ({ ...contracts.marketplace, functionName: "subscribeWithPermit", args: [selected, annual, s.deadline, s.v, s.r, s.s] }),
      cardNote: "In production the PSP webhook would trigger a custodial mint of your plan pass.",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts, selected, annual, prices.data]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <Reveal className="mx-auto max-w-2xl text-center">
        <span className="label-mono">Pricing</span>
        <h1 className="mt-3 font-display text-5xl font-extrabold tracking-tight sm:text-6xl">Simple, transparent pricing</h1>
        <p className="mt-4 text-ink-dim">Subscribe for access, or skip the plan and pay per call. Every receipt lives on-chain.</p>
        <div className="mt-8 flex items-center justify-center gap-4 text-sm">
          <span className={cn(!annual && "text-ink", annual && "text-ink-dim")}>Monthly</span>
          <Toggle checked={annual} onChange={setAnnual} labels={["Monthly billing", "Annual billing"]} />
          <span className={cn(annual ? "text-ink" : "text-ink-dim")}>Annual</span>
          <Badge tone="ok">save 20%</Badge>
        </div>
      </Reveal>

      {pass.data && pass.data.plan !== 0 && (
        <div role="status" className="mx-auto mt-8 max-w-xl rounded-xl border border-ok/30 bg-ok/10 px-4 py-3 text-center text-sm text-ok">
          You hold an active <b>{PLANS[pass.data.plan].name}</b> pass · renews by {formatDate(pass.data.expiresAt)}
        </div>
      )}

      <Cards annual={annual} price={price} current={pass.data?.plan ?? 0} onSelect={(p) => { setSelected(p); setOpen(true); }} loading={prices.isLoading} />

      <Reveal className="mt-20">
        <h2 className="mb-6 font-display text-3xl font-bold">Compare features</h2>
        <div className="scroll-thin overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-bg-raised"><tr className="label-mono text-left"><th className="px-5 py-4 font-normal">Feature</th>{["Free", "Pro", "Team", "Enterprise"].map((h) => <th key={h} className="px-5 py-4 text-center font-normal">{h}</th>)}</tr></thead>
            <tbody>{MATRIX.map((r) => (
              <tr key={r.feature} className="border-t border-line-soft">
                <td className="px-5 py-3.5">{r.feature}</td>
                {[r.free, r.pro, r.team, r.ent].map((v, i) => <td key={i} className="px-5 py-3.5 text-center">{typeof v === "boolean" ? <span className={v ? "text-ok" : "text-ink-faint"} aria-label={v ? "Included" : "Not included"}>{v ? "✓" : "—"}</span> : <span className="num text-ink-dim">{v}</span>}</td>)}
              </tr>))}</tbody>
          </table>
        </div>
      </Reveal>

      <Reveal className="mx-auto mt-20 max-w-3xl">
        <h2 className="mb-6 text-center font-display text-3xl font-bold">Frequently asked questions</h2>
        <div className="divide-y divide-line-soft rounded-2xl border border-line bg-surface">
          {FAQ.map(([q, a], i) => <FaqItem key={q} q={q!} a={a!} open={faq === i} onToggle={() => setFaq(faq === i ? null : i)} id={`faq-${i}`} />)}
        </div>
      </Reveal>

      <CheckoutModal open={open} onClose={() => setOpen(false)} order={order} />
    </div>
  );
}

function Cards({ annual, price, current, onSelect, loading }: { annual: boolean; price: (p: PlanId) => bigint | undefined; current: number; onSelect: (p: PlanId) => void; loading: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    motion(() => { gsap.from(root.current!.children, { y: 36, opacity: 0, duration: 0.8, stagger: 0.1, ease: EASE.out, clearProps: "transform,opacity" }); });
  }, { scope: root });
  return (
    <div ref={root} className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      <Card className="flex flex-col p-6">
        <Eyebrow>Free</Eyebrow><div className="mt-3 font-display text-4xl font-bold">$0</div><p className="mt-1 text-sm text-ink-dim">Explore &amp; prototype</p>
        <ul className="mt-6 flex-1 space-y-2.5 text-sm text-ink-dim">{["500 API calls / month", "Community models", "On-chain usage receipts"].map((f) => <li key={f} className="flex gap-2"><span className="text-ok">✓</span>{f}</li>)}</ul>
        <Button variant="secondary" className="mt-6" href="/explore">Start exploring</Button>
      </Card>
      {([1, 2] as PlanId[]).map((p) => {
        const plan = PLANS[p];
        const amt = price(p);
        const active = current === p;
        return (
          <Card key={p} highlight={p === 1} className="flex flex-col p-6">
            <div className="flex items-center justify-between"><Eyebrow>{plan.name}</Eyebrow>{p === 1 && <Badge>Most popular</Badge>}</div>
            <div className="mt-3 flex items-baseline gap-1"><span className="num font-display text-4xl font-bold">{loading ? "…" : formatUsd(annual && amt ? amt / 12n : amt, { maxFraction: 0 })}</span><span className="text-sm text-ink-dim">/ mo</span></div>
            <p className="mt-1 text-sm text-ink-dim">{annual && amt !== undefined ? `Billed ${formatUsd(amt, { maxFraction: 0 })} yearly` : plan.tagline}</p>
            <ul className="mt-6 flex-1 space-y-2.5 text-sm text-ink-dim">{plan.features.map((f) => <li key={f} className="flex gap-2"><span className="text-ok">✓</span>{f}</li>)}</ul>
            <Button className="mt-6" magnetic variant={p === 1 ? "primary" : "secondary"} onClick={() => onSelect(p)} disabled={amt === undefined}>{active ? "Extend plan" : `Choose ${plan.name}`}</Button>
          </Card>
        );
      })}
      <Card className="flex flex-col p-6">
        <Eyebrow>Enterprise</Eyebrow><div className="mt-3 font-display text-4xl font-bold">Custom</div><p className="mt-1 text-sm text-ink-dim">Dedicated infrastructure</p>
        <ul className="mt-6 flex-1 space-y-2.5 text-sm text-ink-dim">{["Dedicated compute partner", "Perpetual enterprise licenses", "Custom royalty routing", "99.99% SLA"].map((f) => <li key={f} className="flex gap-2"><span className="text-ok">✓</span>{f}</li>)}</ul>
        <Button variant="secondary" className="mt-6" href="mailto:enterprise@neuralhub.example">Contact sales</Button>
      </Card>
    </div>
  );
}

function FaqItem({ q, a, open, onToggle, id }: { q: string; a: string; open: boolean; onToggle: () => void; id: string }) {
  const body = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useGSAP(() => {
    const el = body.current!;
    if (first.current) { first.current = false; gsap.set(el, { height: open ? "auto" : 0 }); return; }
    motion(() => { gsap.to(el, { height: open ? "auto" : 0, duration: 0.35, ease: EASE.out }); }, () => { gsap.set(el, { height: open ? "auto" : 0 }); });
  }, { dependencies: [open] });
  return (
    <div>
      <h3><button onClick={onToggle} aria-expanded={open} aria-controls={id} className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium hover:text-accent-hi">{q}<span aria-hidden className={cn("transition-transform", open && "rotate-45")}>+</span></button></h3>
      <div ref={body} id={id} role="region" className="overflow-hidden" style={{ height: open ? "auto" : 0 }}><p className="px-5 pb-4 text-sm leading-relaxed text-ink-dim">{a}</p></div>
    </div>
  );
}
