"use client";
import { useState } from "react";
import Link from "next/link";
import { isAddress, maxUint256, type Address } from "viem";
import { Badge, Card, EmptyState, Eyebrow, Skeleton, Stat } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Tabs } from "@/components/ui/Tabs";
import { RiskList, TxAction } from "@/components/tx/TxAction";
import { TxStepper } from "@/components/tx/TxStepper";
import { ModelNftCard } from "@/components/nft/ModelNftCard";
import { Reveal } from "@/components/motion/Reveal";
import { CountUp } from "@/components/motion/CountUp";
import { useAppChain } from "@/hooks/useAppChain";
import { useAllowance, useAllLicenses, useCredits, useFaucetCooldown, useNativeBalance, usePending, usePlanPass, useTokenBalance } from "@/features/account/hooks";
import { useModelViews } from "@/features/models/hooks";
import { useTxFlow } from "@/features/tx/useTxFlow";
import { useUi } from "@/lib/store/ui";
import { assessApproval, assessTransfer } from "@/lib/web3/risk";
import { knownAddresses, PAYMENT_DECIMALS, PAYMENT_SYMBOL, PLANS, TIERS } from "@/lib/web3/contracts";
import { formatDate, formatUsd, shortAddress, usdNumber } from "@/lib/web3/format";
import { parseAmount } from "@/lib/validation";
import { useChainQuery } from "@/hooks/useChainQuery";

type Std = "erc20" | "erc721" | "erc1155";

export function Assets() {
  const { address, isConnected, contracts, chain } = useAppChain();
  const openWallet = useUi((s) => s.openWalletModal);
  const [tab, setTab] = useState<Std>("erc20");
  const bal = useTokenBalance(address);
  const native = useNativeBalance();
  const credits = useCredits(address);
  const pending = usePending(address);
  const models = useModelViews();
  const owned = models.views.filter((m) => address && m.owner.toLowerCase() === address.toLowerCase());
  const licenses = useAllLicenses(address, models.data?.length ?? 0);

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
        <EmptyState title="Connect a wallet to see your assets" body="Your NHUSD balance, model NFTs and license tokens are read straight from the chain." action={<Button onClick={openWallet}>Connect wallet</Button>} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <Reveal>
        <span className="label-mono">Token console</span>
        <h1 className="mt-2 font-display text-5xl font-extrabold tracking-tight">My assets</h1>
        <p className="mt-3 max-w-2xl text-ink-dim">Everything you hold on {chain.name}, across three token standards — each with its own interaction model and its own safety checks.</p>
      </Reveal>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`${PAYMENT_SYMBOL} balance`} value={bal.data === undefined ? <Skeleton className="h-7 w-24" /> : <CountUp value={usdNumber(bal.data)} format={(n) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`} />} sub="ERC-20 · payment token" />
        <Stat label="Model NFTs" value={models.isLoading ? "…" : owned.length} sub="ERC-721 · ownership" />
        <Stat label="License tokens" value={licenses.isLoading ? "…" : licenses.data?.length ?? 0} sub="ERC-1155 · usage rights" />
        <Stat label={`Gas (${native.data?.symbol ?? "ETH"})`} value={native.data ? Number(native.data.formatted).toLocaleString("en-US", { maximumFractionDigits: 4 }) : "…"} sub={native.data && native.data.value === 0n ? "No gas — you cannot send transactions" : "Native balance"} tone={native.data && native.data.value === 0n ? "warn" : undefined} />
      </div>

      <div className="mt-10">
        <Tabs<Std> value={tab} onChange={setTab} tabs={[{ id: "erc20", label: "ERC-20 · NHUSD" }, { id: "erc721", label: "ERC-721 · Models", badge: owned.length }, { id: "erc1155", label: "ERC-1155 · Licenses", badge: licenses.data?.length ?? 0 }]} />
        <div className="pt-8">
          {tab === "erc20" && contracts && <Erc20Panel credits={credits.data} pending={pending.data} />}
          {tab === "erc721" && <Erc721Panel owned={owned} loading={models.isLoading} />}
          {tab === "erc1155" && <Erc1155Panel holdings={licenses.data} loading={licenses.isLoading} names={Object.fromEntries(models.views.map((m) => [m.id, m.meta?.name ?? `Model #${m.id}`]))} />}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── ERC-20 ───────────────────────────
function Erc20Panel({ credits, pending }: { credits?: bigint; pending?: bigint }) {
  const { address, chainId, contracts } = useAppChain();
  const bal = useTokenBalance(address);
  const allowance = useAllowance(address, contracts?.marketplace.address);
  const cooldown = useFaucetCooldown(address);
  const plan = usePlanPass(address);
  const now = Math.floor(Date.now() / 1000);
  const nextClaim = cooldown.data && cooldown.data > 0n ? Number(cooldown.data) + 86_400 : 0;
  const waiting = nextClaim > now;

  const faucet = useTxFlow({ chainId, title: "Claimed 1,000 NHUSD" });
  const send = useTxFlow({ chainId, title: "NHUSD sent" });
  const approve = useTxFlow({ chainId, title: "Allowance updated" });

  const [to, setTo] = useState("");
  const [amt, setAmt] = useState("");
  const parsed = parseAmount(amt, PAYMENT_DECIMALS, { max: bal.data });
  const toValid = isAddress(to);
  const sendRisks = toValid ? assessTransfer({ from: address, to: to as Address, amount: parsed.value, largeAbove: 10_000n * 10n ** BigInt(PAYMENT_DECIMALS) }) : [];
  const sendError = (amt && parsed.error) || (to && !toValid ? "Not a valid address" : undefined);

  const [custom, setCustom] = useState("");
  const customParsed = parseAmount(custom, PAYMENT_DECIMALS, { allowZero: true });

  if (!contracts) return null;
  const spender = contracts.marketplace.address;
  const trusted = knownAddresses(contracts);
  const setAllowance = (value: bigint, label: string) =>
    approve.run([{ id: "approve", label, exec: async (api) => void (await api.write({ ...contracts.paymentToken, functionName: "approve", args: [spender, value] })) }]);
  const current = allowance.data ?? 0n;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4 p-6">
        <Eyebrow>Faucet · test NHUSD</Eyebrow>
        <p className="text-sm text-ink-dim">Claim 1,000 test NHUSD to try licensing and metering. One claim per 24h is enforced by the contract.</p>
        <TxStepper steps={faucet.steps} status={faucet.status} error={faucet.error} chainId={chainId} />
        <TxAction size="md" onClick={() => faucet.run([{ id: "faucet", label: "Claim 1,000 NHUSD", exec: async (api) => void (await api.write({ ...contracts.paymentToken, functionName: "faucet" })) }])} loading={faucet.isRunning} disabled={waiting} disabledReason={`Next claim ${formatDate(nextClaim)} · ${new Date(nextClaim * 1000).toLocaleTimeString()}`}>Claim 1,000 NHUSD</TxAction>
      </Card>

      <Card className="space-y-4 p-6">
        <Eyebrow>Balances held in the marketplace</Eyebrow>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between"><dt className="text-ink-dim">Prepaid API credits</dt><dd className="num">{formatUsd(credits)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-dim">Claimable royalties</dt><dd className="num">{formatUsd(pending)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-dim">Plan pass</dt><dd>{plan.data && plan.data.plan !== 0 ? <Badge tone="ok">{PLANS[plan.data.plan].name} · to {formatDate(plan.data.expiresAt)}</Badge> : <span className="text-ink-faint">None</span>}</dd></div>
        </dl>
        <div className="flex gap-3"><Button size="sm" variant="secondary" href="/console">Manage credits</Button><Button size="sm" variant="secondary" href="/dashboard">Claim royalties</Button></div>
      </Card>

      <Card className="space-y-4 p-6">
        <Eyebrow>Transfer NHUSD</Eyebrow>
        <Field label="Recipient" error={to && !toValid ? "Not a valid address" : undefined} htmlFor="to"><Input id="to" mono placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value.trim())} aria-invalid={!!(to && !toValid)} /></Field>
        <Field label="Amount" error={amt ? parsed.error : undefined} htmlFor="amt" hint={`Balance ${formatUsd(bal.data)}`}>
          <Input id="amt" mono inputMode="decimal" placeholder="0.00" value={amt} onChange={(e) => setAmt(e.target.value)} suffix={<button type="button" className="text-accent-hi hover:underline" onClick={() => bal.data !== undefined && setAmt((Number(bal.data) / 10 ** PAYMENT_DECIMALS).toFixed(PAYMENT_DECIMALS).replace(/\.?0+$/, ""))}>MAX</button>} />
        </Field>
        <RiskList flags={sendRisks} />
        <TxStepper steps={send.steps} status={send.status} error={send.error} chainId={chainId} />
        <TxAction size="md" risks={sendRisks} loading={send.isRunning} disabled={!toValid || !!parsed.error || !!sendError} disabledReason={sendError ?? "Enter a recipient and amount"} onClick={() => send.run([{ id: "send", label: `Send ${amt} NHUSD to ${shortAddress(to)}`, exec: async (api) => void (await api.write({ ...contracts.paymentToken, functionName: "transfer", args: [to as Address, parsed.value!] })) }]).then((ok) => { if (ok) { setAmt(""); setTo(""); } })}>Send NHUSD</TxAction>
      </Card>

      <Card className="space-y-4 p-6">
        <Eyebrow>Spending allowance → Marketplace</Eyebrow>
        <p className="text-sm text-ink-dim">Allowance is what the marketplace contract may pull from your wallet. Prefer permit-based checkout (no standing allowance) and revoke anything you no longer need.</p>
        <div className="flex items-center justify-between rounded-xl border border-line-soft bg-bg/60 px-4 py-3 text-sm"><span className="text-ink-dim">Current allowance</span><span className="num">{current >= maxUint256 / 2n ? <Badge tone="warn">Unlimited</Badge> : formatUsd(current)}</span></div>
        <RiskList flags={assessApproval({ amount: current, spender, trusted }).filter((f) => f.code === "unlimited-approval")} />
        <Field label="Set exact allowance" error={custom ? customParsed.error : undefined} htmlFor="allow"><Input id="allow" mono inputMode="decimal" placeholder="0.00" value={custom} onChange={(e) => setCustom(e.target.value)} /></Field>
        <TxStepper steps={approve.steps} status={approve.status} error={approve.error} chainId={chainId} />
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" disabled={!custom || !!customParsed.error || approve.isRunning} onClick={() => setAllowance(customParsed.value!, `Approve ${custom} NHUSD`)}>Set allowance</Button>
          <Button variant="danger" disabled={current === 0n || approve.isRunning} onClick={() => setAllowance(0n, "Revoke allowance")}>Revoke</Button>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────── ERC-721 ───────────────────────────
function Erc721Panel({ owned, loading }: { owned: ReturnType<typeof useModelViews>["views"]; loading: boolean }) {
  const { chainId, contracts, address } = useAppChain();
  const flow = useTxFlow({ chainId, title: "Model NFT transferred" });
  const [target, setTarget] = useState<number | null>(null);
  const [to, setTo] = useState("");
  const toValid = isAddress(to);
  const risks = toValid ? assessTransfer({ from: address, to: to as Address }) : [];

  if (loading) return <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-52" /><Skeleton className="h-52" /></div>;
  if (!owned.length) return <EmptyState title="You don't own any model NFTs yet" body="Minting a model makes you the owner — and the recipient of its creator revenue share. Ownership is transferable." action={<Button href="/dashboard">Mint a model</Button>} />;

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-ink-dim">Owning the ERC-721 means owning the revenue stream: the marketplace pays the <i>current</i> owner, so transferring a model transfers its future royalties (ERC-2981 also routes secondary-sale royalties to the creator).</p>
      <div className="grid gap-5 lg:grid-cols-2">
        {owned.map((m) => (
          <div key={m.id} className="space-y-3">
            <ModelNftCard model={m} />
            {target === m.id ? (
              <Card className="space-y-3 p-4">
                <Field label={`Transfer model #${m.id} to`} error={to && !toValid ? "Not a valid address" : undefined} htmlFor={`to-${m.id}`}><Input id={`to-${m.id}`} mono placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value.trim())} /></Field>
                <RiskList flags={risks} />
                <TxStepper steps={flow.steps} status={flow.status} error={flow.error} chainId={chainId} />
                <div className="flex gap-3">
                  <TxAction full={false} size="md" risks={risks} loading={flow.isRunning} disabled={!toValid} disabledReason="Enter a valid address" onClick={() => contracts && flow.run([{ id: "t", label: `Transfer #${m.id} → ${shortAddress(to)}`, exec: async (api) => void (await api.write({ ...contracts.modelNFT, functionName: "safeTransferFrom", args: [address!, to as Address, BigInt(m.id)] })) }]).then((ok) => { if (ok) { setTarget(null); setTo(""); } })}>Confirm transfer</TxAction>
                  <Button variant="ghost" onClick={() => { setTarget(null); flow.reset(); }}>Cancel</Button>
                </div>
              </Card>
            ) : (
              <div className="flex gap-3"><Button size="sm" variant="secondary" onClick={() => { flow.reset(); setTarget(m.id); }}>Transfer ownership</Button><Button size="sm" variant="ghost" href={`/models/${m.id}`}>View listing</Button></div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────── ERC-1155 ───────────────────────────
function Erc1155Panel({ holdings, loading, names }: { holdings?: ReturnType<typeof useAllLicenses>["data"]; loading: boolean; names: Record<number, string> }) {
  const { chainId, contracts, address } = useAppChain();
  const flow = useTxFlow({ chainId, title: "License transferred" });
  const opFlow = useTxFlow({ chainId, title: "Operator approval updated" });
  const [target, setTarget] = useState<bigint | null>(null);
  const [to, setTo] = useState("");
  const [operator, setOperator] = useState("");
  const toValid = isAddress(to);
  const opValid = isAddress(operator);
  const risks = toValid ? assessTransfer({ from: address, to: to as Address }) : [];
  const approved = useChainQuery(["operator", address, operator], ({ client, c }) => client.readContract({ ...c.licenses, functionName: "isApprovedForAll", args: [address!, operator as Address] }), { enabled: !!address && opValid });
  const opRisks = opValid && contracts ? assessApproval({ amount: maxUint256, spender: operator as Address, trusted: knownAddresses(contracts) }) : [];

  if (loading) return <Skeleton className="h-40" />;
  return (
    <div className="space-y-8">
      <p className="max-w-3xl text-sm text-ink-dim">Licenses are ERC-1155 tokens with an <b>on-chain expiry</b> that travels with the token. A wallet holds one license per (model, tier); transfers move the whole license, expiry included.</p>
      {!holdings?.length ? (
        <EmptyState title="No licenses yet" body="Buy a Personal, Commercial or Enterprise license from any model page." action={<Button href="/explore">Browse models</Button>} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line scroll-thin">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-bg-raised"><tr className="label-mono text-left">{["Model", "Tier", "Token ID", "Expires", "Status", ""].map((h) => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}</tr></thead>
            <tbody>{holdings.map((h) => (
              <tr key={h.tokenId.toString()} className="border-t border-line-soft">
                <td className="px-4 py-3"><Link href={`/models/${h.modelId}`} className="font-medium hover:text-accent-hi">{names[h.modelId] ?? `Model #${h.modelId}`}</Link></td>
                <td className="px-4 py-3">{TIERS.find((t) => t.id === h.tier)?.label}</td>
                <td className="num px-4 py-3 text-ink-dim">{h.tokenId.toString()}</td>
                <td className="num px-4 py-3 text-ink-dim">{h.expiresAt === 0 ? "Perpetual" : formatDate(h.expiresAt)}</td>
                <td className="px-4 py-3"><Badge tone={h.valid ? "ok" : "bad"}>{h.valid ? "valid" : "expired"}</Badge></td>
                <td className="px-4 py-3 text-right"><Button size="sm" variant="secondary" onClick={() => { flow.reset(); setTarget(target === h.tokenId ? null : h.tokenId); }}>Transfer</Button></td>
              </tr>))}</tbody>
          </table>
        </div>
      )}

      {target !== null && contracts && (
        <Card className="max-w-xl space-y-3 p-5">
          <Eyebrow>Transfer license #{target.toString()}</Eyebrow>
          <Field label="Recipient" error={to && !toValid ? "Not a valid address" : undefined} htmlFor="lic-to"><Input id="lic-to" mono placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value.trim())} /></Field>
          <RiskList flags={risks} />
          <TxStepper steps={flow.steps} status={flow.status} error={flow.error} chainId={chainId} />
          <TxAction size="md" risks={risks} loading={flow.isRunning} disabled={!toValid} disabledReason="Enter a valid address" onClick={() => flow.run([{ id: "t", label: `Transfer license → ${shortAddress(to)}`, exec: async (api) => void (await api.write({ ...contracts.licenses, functionName: "safeTransferFrom", args: [address!, to as Address, target, 1n, "0x"] })) }]).then((ok) => { if (ok) { setTarget(null); setTo(""); } })}>Confirm transfer</TxAction>
        </Card>
      )}

      {contracts && (
        <Card className="max-w-xl space-y-3 p-5">
          <Eyebrow>Operator approval · setApprovalForAll</Eyebrow>
          <p className="text-sm text-ink-dim">ERC-1155 approvals are all-or-nothing: an approved operator can move <b>every</b> license you hold. The UI treats unknown operators as high-risk and blocks deny-listed ones.</p>
          <Field label="Operator address" error={operator && !opValid ? "Not a valid address" : undefined} htmlFor="op"><Input id="op" mono placeholder="0x…" value={operator} onChange={(e) => setOperator(e.target.value.trim())} /></Field>
          {opValid && <p className="text-xs text-ink-dim">Currently {approved.data ? <b className="text-warn">approved</b> : "not approved"}.</p>}
          <RiskList flags={opRisks} />
          <TxStepper steps={opFlow.steps} status={opFlow.status} error={opFlow.error} chainId={chainId} />
          <TxAction size="md" variant={approved.data ? "danger" : "secondary"} risks={opRisks} loading={opFlow.isRunning} disabled={!opValid} disabledReason="Enter a valid operator address" onClick={() => opFlow.run([{ id: "op", label: approved.data ? "Revoke operator" : "Approve operator", exec: async (api) => void (await api.write({ ...contracts.licenses, functionName: "setApprovalForAll", args: [operator as Address, !approved.data] })) }])}>{approved.data ? "Revoke operator" : "Approve operator"}</TxAction>
        </Card>
      )}
    </div>
  );
}
