"use client";
import { Badge, Skeleton } from "@/components/ui/Card";
import { useChainQuery } from "@/hooks/useChainQuery";
import { RpcIndexer } from "@/lib/web3/indexer";
import { formatDate, shortAddress } from "@/lib/web3/format";
import { explorerTxUrl } from "@/lib/web3/chains";
import { useAppChain } from "@/hooks/useAppChain";

/** Timeline of ERC-721 Transfer events for a model, read through the Indexer abstraction. */
export function OwnershipHistory({ modelId }: { modelId: number }) {
  const { chain } = useAppChain();
  const q = useChainQuery(["ownership", modelId], ({ client, c }) => new RpcIndexer(client, c).ownershipHistory(modelId));
  if (q.isLoading) return <Skeleton className="h-20 w-full" />;
  if (q.isError) return <p className="text-sm text-bad">Could not load ownership history.</p>;
  if (!q.data?.length) return <p className="text-sm text-ink-faint">No transfers recorded.</p>;
  return (
    <ol className="relative space-y-5 border-l border-line pl-6">
      {[...q.data].reverse().map((e) => {
        const link = explorerTxUrl(chain, e.txHash);
        return (
          <li key={`${e.txHash}${e.logIndex}`} className="relative">
            <span className="absolute -left-[31px] top-1 h-2.5 w-2.5 rounded-full border-2 border-accent bg-bg" />
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={e.data.kind === "mint" ? "ok" : "accent"}>{e.data.kind}</Badge>
              <span className="text-xs text-ink-faint">{formatDate(e.timestamp)}</span>
            </div>
            <div className="num mt-1.5 text-sm">
              {e.data.kind === "mint" ? <>Minted to {shortAddress(e.data.to)}</> : <>{shortAddress(e.data.from)} → {shortAddress(e.data.to)}</>}
            </div>
            {link ? <a href={link} target="_blank" rel="noopener noreferrer" className="num text-[11px] text-accent-hi hover:underline">{shortAddress(e.txHash, 8, 6)} ↗</a> : <span className="num text-[11px] text-ink-faint">{shortAddress(e.txHash, 8, 6)}</span>}
          </li>
        );
      })}
    </ol>
  );
}
