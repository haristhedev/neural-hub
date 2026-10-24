"use client";
import Image from "next/image";
import { Badge, Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Card";
import { useChainQuery } from "@/hooks/useChainQuery";
import { useAppChain } from "@/hooks/useAppChain";
import { explorerAddressUrl } from "@/lib/web3/chains";
import { CATEGORIES } from "@/lib/web3/contracts";
import { bpsToPct, formatDate, shortAddress } from "@/lib/web3/format";
import { safeImageSrc } from "@/lib/web3/ipfs";
import type { ModelView } from "@/features/models/hooks";
import { cn } from "@/lib/utils";

/**
 * Reusable ERC-721 identity card: image, token id, creator, current owner, version, on-chain royalty (ERC-2981)
 * and the token contract. Used on the detail page, the assets page and the dashboard.
 */
export function ModelNftCard({ model, compact, className }: { model: ModelView; compact?: boolean; className?: string }) {
  const { chain, contracts } = useAppChain();
  const img = safeImageSrc(model.meta?.image);
  const royalty = useChainQuery(["royalty", model.id], async ({ client, c }) => {
    const [receiver, amount] = await client.readContract({ ...c.modelNFT, functionName: "royaltyInfo", args: [BigInt(model.id), 10_000n] });
    return { receiver, bps: Number(amount) };
  });
  const link = contracts ? explorerAddressUrl(chain, contracts.modelNFT.address) : undefined;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className={cn("grid gap-0", compact ? "grid-cols-[96px_1fr]" : "sm:grid-cols-[200px_1fr]")}>
        <div className="relative aspect-square bg-bg">
          {img ? <Image src={img} alt={`${model.meta?.name ?? "Model"} NFT artwork`} fill unoptimized sizes="200px" className="object-cover" /> : <Skeleton className="h-full w-full rounded-none" />}
        </div>
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>ERC-721</Badge><Badge tone="mute">{CATEGORIES[model.category]}</Badge><Badge tone="ok">v{model.version.replace(/^v/, "")}</Badge>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-ink-faint">Token ID</dt><dd className="num text-right">#{model.id}</dd>
            <dt className="text-ink-faint">Creator</dt><dd className="num text-right">{shortAddress(model.creator)}</dd>
            <dt className="text-ink-faint">Owner</dt><dd className="num text-right">{shortAddress(model.owner)}</dd>
            {!compact && (<>
              <dt className="text-ink-faint">Minted</dt><dd className="text-right">{formatDate(model.createdAt)}</dd>
              <dt className="text-ink-faint">Royalty (ERC-2981)</dt><dd className="num text-right">{royalty.data ? bpsToPct(royalty.data.bps) : "—"}</dd>
              <dt className="text-ink-faint">Contract</dt>
              <dd className="num text-right">{link ? <a className="text-accent-hi hover:underline" href={link} target="_blank" rel="noopener noreferrer">{shortAddress(contracts?.modelNFT.address)} ↗</a> : shortAddress(contracts?.modelNFT.address)}</dd>
            </>)}
          </dl>
        </div>
      </div>
    </Card>
  );
}
