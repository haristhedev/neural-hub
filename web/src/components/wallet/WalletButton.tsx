"use client";
import { useEffect, useRef, useState } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { Button } from "@/components/ui/Button";
import { useUi } from "@/lib/store/ui";
import { useAppChain } from "@/hooks/useAppChain";
import { shortAddress } from "@/lib/web3/format";
import { explorerAddressUrl, isLocalChain } from "@/lib/web3/chains";
import { useSolana } from "@/lib/solana/phantom";
import { useAuth } from "@/features/auth/useAuth";
import { gsap, motion } from "@/lib/motion/gsap";
import { Badge } from "@/components/ui/Card";
import { useTokenBalance } from "@/features/account/hooks";
import { formatUsd } from "@/lib/web3/format";

export function WalletButton() {
  const openModal = useUi((s) => s.openWalletModal);
  const { address, isConnected, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const { chain, supportedChains, switchTo, wrongNetwork } = useAppChain();
  const sol = useSolana();
  const auth = useAuth();
  const bal = useTokenBalance(address);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || !menu.current) return;
    const mm = motion(() => { gsap.fromTo(menu.current, { y: -8, opacity: 0, scale: 0.97 }, { y: 0, opacity: 1, scale: 1, duration: 0.25, ease: "expo.out" }); });
    const out = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", out);
    document.addEventListener("keydown", esc);
    return () => { mm.revert(); document.removeEventListener("mousedown", out); document.removeEventListener("keydown", esc); };
  }, [open]);

  if (!mounted || (!isConnected && !sol.address)) {
    return <Button magnetic onClick={openModal} size="md">Connect wallet</Button>;
  }

  const label = isConnected ? shortAddress(address) : shortAddress(sol.address);
  const explorer = explorerAddressUrl(chain, address ?? "");

  return (
    <div ref={wrap} className="relative">
      <button
        onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        className="flex h-10 items-center gap-2.5 rounded-lg border border-line bg-surface px-3 font-mono text-xs transition hover:border-accent/60"
      >
        <span className={`h-2 w-2 rounded-full ${wrongNetwork ? "bg-warn" : "bg-ok"} shadow-[0_0_8px] ${wrongNetwork ? "shadow-warn" : "shadow-ok"}`} />
        {isConnected && bal.data !== undefined && <span className="hidden text-ink-dim sm:inline">{formatUsd(bal.data, { maxFraction: 0 })}</span>}
        <span>{label}</span>
      </button>
      {open && (
        <div ref={menu} role="menu" className="absolute right-0 z-40 mt-2 w-72 rounded-2xl border border-line bg-bg-raised p-2 shadow-2xl">
          {isConnected && (
            <div className="space-y-1 p-3">
              <div className="flex items-center justify-between">
                <span className="label-mono">{connector?.name ?? "EVM wallet"}</span>
                {auth.evmSignedIn ? <Badge tone="ok">Signed in</Badge> : <Badge tone="mute">Not signed in</Badge>}
              </div>
              <div className="num break-all text-xs text-ink-dim">{address}</div>
            </div>
          )}
          {isConnected && (
            <div className="border-t border-line-soft p-2">
              <div className="label-mono px-1 pb-1.5">Network</div>
              {supportedChains.map((c) => (
                <button key={c.id} role="menuitem" onClick={() => switchTo(c.id).catch(() => {})} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/5">
                  <span>{c.name}{isLocalChain(c.id) && <span className="ml-2 text-xs text-ink-faint">dev</span>}</span>
                  {chain.id === c.id && !wrongNetwork && <span className="text-ok">●</span>}
                </button>
              ))}
            </div>
          )}
          {sol.address && (
            <div className="border-t border-line-soft p-3">
              <div className="label-mono">Phantom · Solana</div>
              <div className="num mt-1 break-all text-xs text-ink-dim">{sol.address}</div>
            </div>
          )}
          <div className="grid gap-1 border-t border-line-soft p-2">
            <button role="menuitem" onClick={async () => { await navigator.clipboard.writeText(address ?? sol.address ?? ""); setCopied(true); setTimeout(() => setCopied(false), 1200); }} className="rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/5">{copied ? "Copied ✓" : "Copy address"}</button>
            {explorer && <a role="menuitem" href={explorer} target="_blank" rel="noopener noreferrer" className="rounded-lg px-2 py-1.5 text-sm hover:bg-white/5">View on explorer ↗</a>}
            {isConnected && !auth.evmSignedIn && <button role="menuitem" onClick={() => { setOpen(false); openModal(); }} className="rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/5">Sign in with wallet…</button>}
            {auth.session && <button role="menuitem" onClick={() => auth.signOut.mutate()} className="rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/5">Sign out</button>}
            <button role="menuitem" onClick={() => { setOpen(false); openModal(); }} className="rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/5">Manage wallets</button>
            <button role="menuitem" onClick={() => { disconnect(); void sol.disconnect(); auth.signOut.mutate(); setOpen(false); }} className="rounded-lg px-2 py-1.5 text-left text-sm text-bad hover:bg-bad/10">Disconnect all</button>
          </div>
        </div>
      )}
    </div>
  );
}
