"use client";
import { useEffect, useMemo, useState } from "react";
import { useAccount, useConnect, useConnectors, useDisconnect } from "wagmi";
import type { Connector } from "wagmi";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { useUi } from "@/lib/store/ui";
import { useAppChain } from "@/hooks/useAppChain";
import { walletConnectEnabled } from "@/lib/web3/config";
import { safeImageSrc } from "@/lib/web3/ipfs";
import { PHANTOM_INSTALL_URL, getPhantom, useSolana } from "@/lib/solana/phantom";
import { useAuth } from "@/features/auth/useAuth";
import { shortAddress } from "@/lib/web3/format";
import { cn } from "@/lib/utils";

type Step = "choose" | "signin";

const INSTALL: Record<string, string> = { "io.metamask": "https://metamask.io/download/", "app.phantom": PHANTOM_INSTALL_URL };

/** Turns the many shapes of wallet errors into one actionable sentence. */
function describeConnectError(e: unknown): string {
  const err = e as { code?: number; name?: string; message?: string };
  if (err?.code === 4001 || err?.name === "UserRejectedRequestError") return "Connection request was rejected in your wallet.";
  if (err?.code === -32002) return "A request is already pending — open your wallet extension and approve it.";
  if (/connector already connected/i.test(err?.message ?? "")) return "This wallet is already connected.";
  if (/provider not found|not installed/i.test(err?.message ?? "")) return "Wallet not found. Install it or choose another.";
  return err?.message?.slice(0, 160) || "Could not connect. Try again.";
}

function WalletIcon({ connector }: { connector: Connector }) {
  const src = safeImageSrc(connector.icon);
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt="" width={36} height={36} className="h-9 w-9 rounded-lg" />;
  return <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent-lo font-display text-sm font-bold text-accent-hi">{connector.name.slice(0, 1)}</span>;
}

export function WalletModal() {
  const open = useUi((s) => s.walletModalOpen);
  const close = useUi((s) => s.closeWalletModal);
  const { chainId: appChainId } = useAppChain();
  const connectors = useConnectors();
  const { connectAsync, isPending, variables } = useConnect();
  const { isConnected, address, connector: active } = useAccount();
  const { disconnect } = useDisconnect();
  const sol = useSolana();
  const auth = useAuth();
  const [step, setStep] = useState<Step>("choose");
  const [error, setError] = useState<string>();
  const [hasPhantom, setHasPhantom] = useState(false);

  useEffect(() => { setHasPhantom(!!getPhantom()); }, [open]);
  useEffect(() => { if (open) { setStep("choose"); setError(undefined); } }, [open]);

  // EIP-6963 connectors carry an rdns id ("io.metamask"); hide the generic fallback when real ones exist.
  const evm = useMemo(() => {
    const discovered = connectors.filter((c) => c.type === "injected" && c.id.includes("."));
    const rest = connectors.filter((c) => c.type !== "injected" && c.id !== "injected");
    const generic = discovered.length ? [] : connectors.filter((c) => c.id === "injected");
    const missing = ["io.metamask"].filter((id) => !discovered.some((d) => d.id === id));
    return { installed: [...discovered, ...generic], extra: rest, missing };
  }, [connectors]);

  async function connect(connector: Connector) {
    setError(undefined);
    try {
      await connectAsync({ connector, chainId: appChainId });
      setStep("signin");
    } catch (e) { setError(describeConnectError(e)); }
  }

  const connectingId = isPending ? variables?.connector && (variables.connector as Connector).uid : undefined;

  return (
    <Modal open={open} onClose={close} title="Connect wallet" wide>
      {step === "signin" && (isConnected || sol.address) ? (
        <div className="space-y-6">
          <div data-stagger>
            <span className="label-mono">Step 2 of 2</span>
            <h2 className="mt-1 font-display text-2xl font-bold">Verify it&apos;s you</h2>
            <p className="mt-2 text-sm text-ink-dim">
              Sign a free message to prove you own <span className="num text-ink">{shortAddress(address ?? sol.address)}</span>. It costs no gas and cannot move funds — it only unlocks
              authenticated features like metered API calls.
            </p>
          </div>
          {auth.errorMessage && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{auth.errorMessage}</p>}
          <div data-stagger className="flex flex-col gap-2 sm:flex-row">
            <Button loading={auth.signIn.isPending} onClick={async () => { await auth.signIn.mutateAsync(isConnected ? "evm" : "solana").then(close).catch(() => {}); }}>Sign message</Button>
            <Button variant="ghost" onClick={close}>Skip for now</Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-[1fr_1fr]">
          <div data-stagger className="md:col-span-2">
            <h2 className="font-display text-2xl font-bold">Connect a wallet</h2>
            <p className="mt-1 text-sm text-ink-dim">Pick the wallet you use. NeuralHub never sees your keys — you approve every transaction in your wallet.</p>
          </div>

          {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad md:col-span-2">{error}</p>}

          <section data-stagger aria-labelledby="evm-h">
            <h3 id="evm-h" className="label-mono mb-3">EVM · Ethereum, Base, Polygon</h3>
            <ul className="space-y-2">
              {[...evm.installed, ...evm.extra].map((c) => {
                const connected = isConnected && active?.uid === c.uid;
                return (
                  <li key={c.uid}>
                    <button
                      onClick={() => (connected ? disconnect() : connect(c))}
                      disabled={isPending}
                      className={cn("flex w-full items-center gap-3 rounded-xl border bg-bg/60 p-3 text-left transition hover:border-accent/60 hover:bg-surface disabled:opacity-60", connected ? "border-ok/50" : "border-line")}
                    >
                      <WalletIcon connector={c} />
                      <span className="flex-1">
                        <span className="block text-sm font-medium">{c.name}</span>
                        <span className="block text-xs text-ink-faint">{c.type === "walletConnect" ? "QR code / mobile wallets" : "Browser wallet"}</span>
                      </span>
                      {connectingId === c.uid ? <Spinner /> : connected ? <Badge tone="ok">Connected · {shortAddress(address, 4, 4)}</Badge> : <Badge tone="mute">{c.type === "walletConnect" ? "Mobile" : "Detected"}</Badge>}
                    </button>
                  </li>
                );
              })}
              {evm.missing.map((id) => (
                <li key={id}>
                  <a href={INSTALL[id]} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-dashed border-line p-3 transition hover:border-accent/60">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/5 font-display text-sm font-bold text-ink-dim">M</span>
                    <span className="flex-1 text-sm font-medium">MetaMask</span>
                    <Badge tone="warn">Install</Badge>
                  </a>
                </li>
              ))}
              {!walletConnectEnabled && (
                <li className="rounded-xl border border-dashed border-line p-3 text-xs text-ink-faint">
                  WalletConnect is off — set <code className="num text-ink-dim">NEXT_PUBLIC_WC_PROJECT_ID</code> to enable QR / mobile wallets.
                </li>
              )}
            </ul>
          </section>

          <section data-stagger aria-labelledby="sol-h">
            <h3 id="sol-h" className="label-mono mb-3">Solana</h3>
            <button
              onClick={async () => { setError(undefined); if (!hasPhantom) { window.open(PHANTOM_INSTALL_URL, "_blank", "noopener,noreferrer"); return; } await sol.connect(); if (useSolana.getState().address) setStep("signin"); }}
              className={cn("flex w-full items-center gap-3 rounded-xl border bg-bg/60 p-3 text-left transition hover:border-accent/60 hover:bg-surface", sol.address ? "border-ok/50" : "border-line")}
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#ab9ff2]/20 font-display text-sm font-bold text-[#ab9ff2]">P</span>
              <span className="flex-1">
                <span className="block text-sm font-medium">Phantom</span>
                <span className="block text-xs text-ink-faint">Solana · wallet login &amp; balance</span>
              </span>
              {sol.status === "connecting" ? <Spinner /> : sol.address ? <Badge tone="ok">{shortAddress(sol.address, 4, 4)}</Badge> : <Badge tone={hasPhantom ? "mute" : "warn"}>{hasPhantom ? "Detected" : "Install"}</Badge>}
            </button>
            {sol.error && <p role="alert" className="mt-2 text-xs text-bad">{sol.error}</p>}
            {sol.address && <Button variant="ghost" size="sm" className="mt-2" onClick={() => sol.disconnect()}>Disconnect Solana</Button>}
            <p className="mt-4 text-xs leading-relaxed text-ink-faint">
              Marketplace purchases and metering settle on EVM chains. Solana is supported for wallet login and balance display; on-chain Solana settlement needs the program from the roadmap.
            </p>
          </section>
        </div>
      )}
    </Modal>
  );
}
