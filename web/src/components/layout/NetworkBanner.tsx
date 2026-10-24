"use client";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { Button } from "@/components/ui/Button";
import { useAppChain } from "@/hooks/useAppChain";
import { isLocalChain } from "@/lib/web3/chains";

/** Surfaces the three ways the chain layer can be unhappy, each with the fix right next to it. */
export function NetworkBanner() {
  const { chain, chainId, wrongNetwork, notDeployed, switchTo, isSwitching } = useAppChain();
  const client = usePublicClient({ chainId });
  const health = useQuery({
    queryKey: ["nh-meta", "rpc-health", chainId],
    enabled: !!client && !notDeployed,
    refetchInterval: 12_000,
    retry: 0,
    queryFn: async () => Number(await client!.getBlockNumber()),
  });

  let msg: React.ReactNode = null;
  let action: React.ReactNode = null;
  if (wrongNetwork) {
    msg = <>Your wallet is on an unsupported network. Switch to <b>{chain.name}</b> to transact.</>;
    action = <Button size="sm" variant="secondary" loading={isSwitching} onClick={() => switchTo(chainId).catch(() => {})}>Switch</Button>;
  } else if (notDeployed) {
    msg = <>NeuralHub contracts are not deployed on <b>{chain.name}</b> yet — browsing is limited.</>;
  } else if (health.isError) {
    msg = isLocalChain(chainId)
      ? <>Can&apos;t reach the local chain. Run <code className="num rounded bg-black/30 px-1.5 py-0.5">pnpm chain</code> then <code className="num rounded bg-black/30 px-1.5 py-0.5">pnpm deploy:local</code>.</>
      : <>Can&apos;t reach the {chain.name} RPC endpoint. Retrying…</>;
  }
  if (!msg) return null;
  return (
    <div role="status" className="border-b border-warn/30 bg-warn/10">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 text-sm text-warn sm:px-6"><span>{msg}</span>{action}</div>
    </div>
  );
}
