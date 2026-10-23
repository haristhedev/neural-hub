import type { Address, PublicClient } from "viem";
import type { Contracts } from "./contracts";

export interface ModelRecord {
  id: number;
  owner: Address;
  creator: Address;
  category: number;
  version: string;
  createdAt: number;
  tokenURI: string;
  pricing: { personal: bigint; commercial: bigint; enterprise: bigint; perCall: bigint; listed: boolean };
  split: { partner: Address; partnerBps: number };
  totalCalls: bigint;
  totalRevenue: bigint;
}

export async function fetchModelRecord(client: PublicClient, c: Contracts, id: number): Promise<ModelRecord> {
  const bid = BigInt(id);
  const [owner, info, tokenURI, pricing, split, totalCalls, totalRevenue] = await Promise.all([
    client.readContract({ ...c.modelNFT, functionName: "ownerOf", args: [bid] }),
    client.readContract({ ...c.modelNFT, functionName: "modelInfo", args: [bid] }),
    client.readContract({ ...c.modelNFT, functionName: "tokenURI", args: [bid] }),
    client.readContract({ ...c.marketplace, functionName: "getPricing", args: [bid] }),
    client.readContract({ ...c.marketplace, functionName: "getSplit", args: [bid] }),
    client.readContract({ ...c.marketplace, functionName: "totalCalls", args: [bid] }),
    client.readContract({ ...c.marketplace, functionName: "totalRevenue", args: [bid] }),
  ]);
  return {
    id,
    owner,
    creator: info.creator,
    category: Number(info.category),
    version: info.version,
    createdAt: Number(info.createdAt),
    tokenURI,
    pricing: {
      personal: pricing.personal,
      commercial: pricing.commercial,
      enterprise: pricing.enterprise,
      perCall: pricing.perCall,
      listed: pricing.listed,
    },
    split: { partner: split.partner, partnerBps: Number(split.partnerBps) },
    totalCalls,
    totalRevenue,
  };
}

/** HTTP batching on the transport coalesces these into very few RPC round-trips. */
export async function fetchAllModels(client: PublicClient, c: Contracts): Promise<ModelRecord[]> {
  const total = Number(await client.readContract({ ...c.modelNFT, functionName: "totalSupply" }));
  const ids = Array.from({ length: total }, (_, i) => i + 1);
  return Promise.all(ids.map((id) => fetchModelRecord(client, c, id)));
}
