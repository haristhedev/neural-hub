"use client";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { useUi } from "@/lib/store/ui";
import { useAppChain } from "@/hooks/useAppChain";
import type { RiskFlag } from "@/lib/web3/risk";
import { hasDanger } from "@/lib/web3/risk";
import { cn } from "@/lib/utils";

/**
 * The one button used for every on-chain action. It resolves "why can't I click this?" in priority order:
 *   not connected → wrong network → contracts missing → danger flag → busy → disabled reason → ready.
 */
export function TxAction({
  children, onClick, loading, disabled, disabledReason, risks, variant, size = "lg", className, full = true,
}: {
  children: ReactNode; onClick: () => void; loading?: boolean; disabled?: boolean; disabledReason?: string;
  risks?: RiskFlag[]; variant?: "primary" | "secondary" | "danger"; size?: "sm" | "md" | "lg"; className?: string; full?: boolean;
}) {
  const openModal = useUi((s) => s.openWalletModal);
  const { isConnected, wrongNetwork, notDeployed, chain, switchTo, chainId } = useAppChain();
  const w = full ? "w-full" : "";

  if (!isConnected) return <Button size={size} className={cn(w, className)} onClick={openModal}>Connect wallet to continue</Button>;
  if (wrongNetwork) return <Button size={size} variant="secondary" className={cn(w, className)} onClick={() => switchTo(chainId).catch(() => {})}>Switch to {chain.name}</Button>;
  if (notDeployed) return <Button size={size} variant="secondary" disabled className={cn(w, className)}>Not deployed on {chain.name}</Button>;
  const blocked = risks && hasDanger(risks);
  return (
    <div className={cn("space-y-2", full && "w-full")}>
      <Button size={size} variant={variant} className={cn(w, className)} onClick={onClick} loading={loading} disabled={disabled || blocked}>{children}</Button>
      {(disabledReason && disabled) && <p className="text-center text-xs text-ink-faint">{disabledReason}</p>}
    </div>
  );
}

export function RiskList({ flags }: { flags: RiskFlag[] }) {
  if (!flags.length) return null;
  return (
    <ul className="space-y-1.5" aria-label="Security checks">
      {flags.map((f) => (
        <li key={f.code} className={cn("flex gap-2 rounded-lg border px-3 py-2 text-xs", f.level === "danger" ? "border-bad/40 bg-bad/10 text-bad" : f.level === "warn" ? "border-warn/40 bg-warn/10 text-warn" : "border-line bg-white/5 text-ink-dim")}>
          <span aria-hidden>{f.level === "danger" ? "⛔" : f.level === "warn" ? "⚠" : "ℹ"}</span>
          <span>{f.message}</span>
        </li>
      ))}
    </ul>
  );
}
