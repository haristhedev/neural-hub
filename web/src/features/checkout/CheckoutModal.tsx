"use client";
import { useMemo, useRef, useState } from "react";
import { maxUint256, type PublicClient } from "viem";
import { usePublicClient } from "wagmi";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { TxStepper } from "@/components/tx/TxStepper";
import { RiskList, TxAction } from "@/components/tx/TxAction";
import { gsap, useGSAP, motion } from "@/lib/motion/gsap";
import { useAppChain } from "@/hooks/useAppChain";
import { useAllowance, useTokenBalance } from "@/features/account/hooks";
import { buildPaidSteps, type ApprovalMethod } from "@/features/tx/payment";
import { useTxFlow, type ContractCall } from "@/features/tx/useTxFlow";
import type { PermitSignature } from "@/features/tx/permit";
import { assessApproval } from "@/lib/web3/risk";
import { knownAddresses, PAYMENT_SYMBOL } from "@/lib/web3/contracts";
import { formatUsd, usdNumber } from "@/lib/web3/format";
import { cardSchema } from "@/lib/validation";
import { cn } from "@/lib/utils";

export interface Order {
  title: string;
  subtitle: string;
  badge: string;
  amount: bigint; // NHUSD base units
  lines: { label: string; value: string }[];
  /** share of gross revenue per payee, in basis points (sums to 10_000) */
  split: { label: string; bps: number }[];
  cta: string;
  actionLabel: string;
  action: ContractCall;
  actionWithPermit: (sig: PermitSignature) => ContractCall;
  /** can this order be paid with a card? (plans: yes; license mints need a custodial step) */
  cardNote?: string;
}

type Pane = "card" | "crypto" | "split";

export function CheckoutModal({ order, open, onClose }: { order: Order | null; open: boolean; onClose: () => void }) {
  const [pane, setPane] = useState<Pane>("crypto");
  if (!order) return null;
  return (
    <Modal open={open} onClose={onClose} title={`Checkout — ${order.title}`} wide>
      <div className="grid gap-8 md:grid-cols-[0.9fr_1.1fr]">
        <aside data-stagger className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-xl font-bold">Order summary</h2>
          <div className="mt-4 rounded-xl border border-line-soft bg-bg/60 p-4">
            <Badge>{order.badge}</Badge>
            <div className="mt-2 font-display text-lg font-semibold">{order.title}</div>
            <p className="mt-1 text-sm text-ink-dim">{order.subtitle}</p>
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            {order.lines.map((l) => <div key={l.label} className="flex justify-between"><dt className="text-ink-dim">{l.label}</dt><dd className="num">{l.value}</dd></div>)}
            <div className="flex justify-between border-t border-line pt-3 font-medium"><dt>Total due today</dt><dd className="num text-lg text-accent-hi">{formatUsd(order.amount)}</dd></div>
          </dl>
        </aside>
        <div data-stagger>
          <span className="label-mono">Secure gateway</span>
          <h2 className="mb-4 font-display text-3xl font-bold">Complete your checkout</h2>
          <Tabs<Pane> value={pane} onChange={setPane} tabs={[{ id: "card", label: "Credit card" }, { id: "crypto", label: "Web3 crypto" }, { id: "split", label: "Royalty split" }]} />
          <div className="pt-5">
            {pane === "crypto" && <CryptoPane order={order} onDone={onClose} />}
            {pane === "card" && <CardPane order={order} />}
            {pane === "split" && <SplitPane order={order} />}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────────── crypto ─────────────────────────────
function CryptoPane({ order, onDone }: { order: Order; onDone: () => void }) {
  const { address, chainId, chain, contracts } = useAppChain();
  const client = usePublicClient({ chainId }) as PublicClient | undefined;
  const bal = useTokenBalance(address);
  const allowance = useAllowance(address, contracts?.marketplace.address);
  const [method, setMethod] = useState<ApprovalMethod>("permit");
  const flow = useTxFlow({ chainId, title: order.title });
  const faucet = useTxFlow({ chainId, title: "Claimed test NHUSD" });

  const insufficient = bal.data !== undefined && bal.data < order.amount;
  const covered = (allowance.data ?? 0n) >= order.amount;
  const risks = useMemo(
    () => (contracts && method === "unlimited" && !covered ? assessApproval({ amount: maxUint256, spender: contracts.marketplace.address, trusted: knownAddresses(contracts) }) : []),
    [contracts, method, covered],
  );

  const pay = async () => {
    if (!client || !contracts || !address) return;
    await flow.run(buildPaidSteps({ client, c: contracts, owner: address, amount: order.amount, allowance: allowance.data ?? 0n, method, action: order.action, actionLabel: order.actionLabel, actionWithPermit: order.actionWithPermit }));
  };

  const claimFaucet = () => contracts && faucet.run([{ id: "faucet", label: "Claim 1,000 test NHUSD", exec: async (api) => void (await api.write({ ...contracts.paymentToken, functionName: "faucet" })) }]);

  const tiles = [
    { id: "evm", name: chain.name, sub: "Active wallet network", active: true },
    { id: "usd", name: `${PAYMENT_SYMBOL} stablecoin`, sub: "6 decimals · EIP-2612 permit", active: true },
    { id: "sol", name: "Solana", sub: "Settlement program on roadmap", active: false },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.id} aria-disabled={!t.active} className={cn("rounded-xl border p-3.5", t.active ? "border-accent/60 bg-accent-lo/30" : "border-line opacity-50")}>
            <div className="text-sm font-semibold">{t.name}</div>
            <div className="mt-1 font-mono text-[11px] text-ink-dim">{t.sub}</div>
          </div>
        ))}
      </div>

      {!covered && (
        <fieldset className="space-y-2" disabled={flow.isRunning}>
          <legend className="label-mono mb-2">Token approval</legend>
          {([
            ["permit", "Permit signature (recommended)", "One transaction. You sign a free message instead of sending an approve tx."],
            ["approve", "Approve exact amount", "Two transactions. Allowance is limited to this order."],
            ["unlimited", "Approve unlimited", "Two transactions. Not recommended."],
          ] as [ApprovalMethod, string, string][]).map(([id, t, d]) => (
            <label key={id} className={cn("flex cursor-pointer gap-3 rounded-xl border p-3 transition", method === id ? "border-accent bg-accent-lo/30" : "border-line hover:border-line/80")}>
              <input type="radio" name="approval" checked={method === id} onChange={() => setMethod(id)} className="mt-1 accent-[#8b5cf6]" />
              <span><span className="block text-sm font-medium">{t}</span><span className="block text-xs text-ink-dim">{d}</span></span>
            </label>
          ))}
        </fieldset>
      )}
      <RiskList flags={risks} />

      <div className="flex items-center justify-between rounded-xl border border-line-soft bg-bg/60 px-4 py-3 text-sm">
        <span className="text-ink-dim">Your {PAYMENT_SYMBOL} balance</span>
        <span className="num">{formatUsd(bal.data)}</span>
      </div>

      {insufficient && (
        <div role="alert" className="space-y-3 rounded-xl border border-warn/30 bg-warn/10 p-4 text-sm text-warn">
          Balance is {formatUsd(bal.data)} — this order needs {formatUsd(order.amount)}.
          <div><Button size="sm" variant="secondary" loading={faucet.isRunning} onClick={claimFaucet}>Claim test NHUSD</Button></div>
          {faucet.error && <p className="text-xs">{faucet.error.message}</p>}
        </div>
      )}

      <TxStepper steps={flow.steps} status={flow.status} error={flow.error} chainId={chainId} />

      {flow.status === "success" ? (
        <Button size="lg" className="w-full" onClick={() => { flow.reset(); onDone(); }}>Done</Button>
      ) : (
        <TxAction onClick={pay} loading={flow.isRunning} disabled={insufficient || bal.data === undefined || allowance.data === undefined} disabledReason={insufficient ? "Not enough NHUSD" : "Loading balances…"} risks={risks}>{order.cta}</TxAction>
      )}
      <p className="text-center text-xs text-ink-faint">Every call is simulated before your wallet opens, so failing transactions are caught for free.</p>
    </div>
  );
}

// ───────────────────────────── card (simulated) ─────────────────────────────
function CardPane({ order }: { order: Order }) {
  const [f, setF] = useState({ name: "", number: "", exp: "", cvc: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  const fmtNum = (v: string) => v.replace(/\D/g, "").slice(0, 19).replace(/(.{4})/g, "$1 ").trim();
  const fmtExp = (v: string) => { const d = v.replace(/\D/g, "").slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)} / ${d.slice(2)}` : d; };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = cardSchema.safeParse(f);
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]))); return; }
    setErrors({}); setState("loading");
    const res = await fetch("/api/checkout/card", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amountUsd: usdNumber(order.amount), description: order.title, card: parsed.data }) });
    const json = (await res.json().catch(() => ({}))) as { receiptId?: string; message?: string };
    if (res.ok) { setState("done"); setMsg(`Receipt ${json.receiptId}`); } else { setState("error"); setMsg(json.message ?? "Payment failed"); }
  };

  if (state === "done") return <div className="rounded-xl border border-ok/30 bg-ok/10 p-5 text-sm text-ok">Simulated payment succeeded · {msg}<p className="mt-2 text-xs opacity-80">{order.cardNote ?? "In production the PSP webhook would trigger the on-chain mint to your wallet."}</p></div>;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">Test mode — simulated processor, no real charge. Use any Luhn-valid number (e.g. 4242 4242 4242 4242). Number ending 0002 is declined.</p>
      <Field label="Name on card" error={errors.name} htmlFor="cc-name"><Input id="cc-name" autoComplete="cc-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-invalid={!!errors.name} /></Field>
      <Field label="Card number" error={errors.number} htmlFor="cc-num"><Input id="cc-num" mono inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242" value={f.number} onChange={(e) => setF({ ...f, number: fmtNum(e.target.value) })} aria-invalid={!!errors.number} /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Expiry" error={errors.exp} htmlFor="cc-exp"><Input id="cc-exp" mono inputMode="numeric" autoComplete="cc-exp" placeholder="MM / YY" value={f.exp} onChange={(e) => setF({ ...f, exp: fmtExp(e.target.value) })} aria-invalid={!!errors.exp} /></Field>
        <Field label="CVC" error={errors.cvc} htmlFor="cc-cvc"><Input id="cc-cvc" mono inputMode="numeric" autoComplete="cc-csc" maxLength={4} value={f.cvc} onChange={(e) => setF({ ...f, cvc: e.target.value.replace(/\D/g, "") })} aria-invalid={!!errors.cvc} /></Field>
      </div>
      {state === "error" && <p role="alert" className="text-sm text-bad">{msg}</p>}
      <Button type="submit" size="lg" className="w-full" loading={state === "loading"}>Pay {formatUsd(order.amount)}</Button>
    </form>
  );
}

// ───────────────────────────── royalty split ─────────────────────────────
function SplitPane({ order }: { order: Order }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => { motion(() => { gsap.from(root.current!.querySelectorAll("[data-bar]"), { scaleX: 0, transformOrigin: "left center", duration: 0.9, stagger: 0.12, ease: "power3.out" }); }); }, { scope: root });
  return (
    <div ref={root} className="space-y-4">
      <p className="text-sm text-ink-dim">Settlement is automatic: when this order confirms, the marketplace contract splits revenue between payees. Nobody has to trust an invoice.</p>
      {order.split.map((s) => (
        <div key={s.label}>
          <div className="mb-1.5 flex justify-between text-sm"><span>{s.label}</span><span className="num">{(s.bps / 100).toFixed(s.bps % 100 ? 1 : 0)}% · {formatUsd((order.amount * BigInt(s.bps)) / 10_000n)}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-bg"><div data-bar className="h-full rounded-full bg-gradient-to-r from-accent to-accent-hi" style={{ width: `${s.bps / 100}%` }} /></div>
        </div>
      ))}
      <p className="text-xs text-ink-faint">Payees claim their balance with a pull-payment <code className="num">claim()</code> — no funds are pushed to arbitrary contracts.</p>
    </div>
  );
}
