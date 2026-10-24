import type { Address, Hex, PublicClient } from "viem";
import { parseAbiItem } from "viem";
import type { Contracts } from "./contracts";

/**
 * Event indexing layer.
 * The UI depends on the `Indexer` interface, not on `getLogs`. `RpcIndexer` below scans logs straight
 * from the chain (fine for a new protocol / testnets); swapping in The Graph, Ponder or an internal
 * indexer means implementing the same four methods — no component changes.
 */
export interface TimestampedLog<T> {
  blockNumber: bigint;
  txHash: Hex;
  logIndex: number;
  timestamp: number;
  data: T;
}

export interface OwnershipEvent { from: Address; to: Address; kind: "mint" | "transfer" }
export interface UsageEvent { batchId: Hex; modelId: bigint; user: Address; calls: bigint; cost: bigint }
export interface RevenueEvent { modelId: bigint; owner: Address; ownerShare: bigint; partner: Address; partnerShare: bigint; platformShare: bigint }
export interface PurchaseEvent { buyer: Address; modelId: bigint; tier: number; price: bigint; expiresAt: bigint }

export interface Indexer {
  ownershipHistory(modelId: number): Promise<TimestampedLog<OwnershipEvent>[]>;
  usage(filter: { modelIds?: number[]; user?: Address }): Promise<TimestampedLog<UsageEvent>[]>;
  revenue(modelIds: number[]): Promise<TimestampedLog<RevenueEvent>[]>;
  purchases(filter: { modelId?: number; buyer?: Address }): Promise<TimestampedLog<PurchaseEvent>[]>;
}

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");
const usageEvent = parseAbiItem("event UsageRecorded(bytes32 indexed batchId, uint256 indexed modelId, address indexed user, uint256 calls, uint256 cost)");
const revenueEvent = parseAbiItem("event RevenueDistributed(uint256 indexed modelId, address owner, uint256 ownerShare, address partner, uint256 partnerShare, uint256 platformShare)");
const purchaseEvent = parseAbiItem("event LicensePurchased(address indexed buyer, uint256 indexed modelId, uint8 tier, uint256 price, uint64 expiresAt)");

const CHUNK = 9_000n; // stays under the 10k-block limit many public RPCs enforce
const blockTimeCache = new Map<string, number>();

export class RpcIndexer implements Indexer {
  constructor(private client: PublicClient, private c: Contracts) {}

  private async scan<E extends ReturnType<typeof parseAbiItem>>(address: Address, event: E, args?: Record<string, unknown>) {
    const latest = await this.client.getBlockNumber();
    const from = BigInt(this.c.deployment.startBlock);
    const ranges: [bigint, bigint][] = [];
    for (let s = from; s <= latest; s += CHUNK) ranges.push([s, s + CHUNK - 1n > latest ? latest : s + CHUNK - 1n]);
    const pages = await Promise.all(
      ranges.map(([fromBlock, toBlock]) =>
        this.client.getLogs({ address, event: event as never, args: args as never, fromBlock, toBlock }),
      ),
    );
    return pages.flat() as unknown as Array<{ blockNumber: bigint; transactionHash: Hex; logIndex: number; args: Record<string, never> }>;
  }

  private async stamp<T>(
    logs: Array<{ blockNumber: bigint; transactionHash: Hex; logIndex: number; args: Record<string, never> }>,
    map: (args: Record<string, never>) => T,
  ): Promise<TimestampedLog<T>[]> {
    const unique = [...new Set(logs.map((l) => l.blockNumber))];
    await Promise.all(
      unique.map(async (bn) => {
        const key = `${this.c.deployment.chainId}:${bn}`;
        if (!blockTimeCache.has(key)) {
          const b = await this.client.getBlock({ blockNumber: bn });
          blockTimeCache.set(key, Number(b.timestamp));
        }
      }),
    );
    return logs
      .map((l) => ({
        blockNumber: l.blockNumber,
        txHash: l.transactionHash,
        logIndex: l.logIndex,
        timestamp: blockTimeCache.get(`${this.c.deployment.chainId}:${l.blockNumber}`) ?? 0,
        data: map(l.args),
      }))
      .sort((a, b) => a.timestamp - b.timestamp || a.logIndex - b.logIndex);
  }

  async ownershipHistory(modelId: number) {
    const logs = await this.scan(this.c.modelNFT.address, transferEvent, { tokenId: BigInt(modelId) });
    return this.stamp<OwnershipEvent>(logs, (a) => {
      const from = a.from as unknown as Address;
      return { from, to: a.to as unknown as Address, kind: /^0x0+$/.test(from) ? "mint" : "transfer" };
    });
  }

  async usage({ modelIds, user }: { modelIds?: number[]; user?: Address }) {
    const logs = await this.scan(this.c.marketplace.address, usageEvent, {
      ...(modelIds ? { modelId: modelIds.map(BigInt) } : {}),
      ...(user ? { user } : {}),
    });
    return this.stamp<UsageEvent>(logs, (a) => a as unknown as UsageEvent);
  }

  async revenue(modelIds: number[]) {
    if (!modelIds.length) return [];
    const logs = await this.scan(this.c.marketplace.address, revenueEvent, { modelId: modelIds.map(BigInt) });
    return this.stamp<RevenueEvent>(logs, (a) => a as unknown as RevenueEvent);
  }

  async purchases({ modelId, buyer }: { modelId?: number; buyer?: Address }) {
    const logs = await this.scan(this.c.marketplace.address, purchaseEvent, {
      ...(modelId !== undefined ? { modelId: BigInt(modelId) } : {}),
      ...(buyer ? { buyer } : {}),
    });
    return this.stamp<PurchaseEvent>(logs, (a) => ({ ...(a as unknown as PurchaseEvent), tier: Number(a.tier) }));
  }
}

// ── pure aggregation helpers (unit-tested, used by charts) ─────────────────
export function bucketByMonth<T>(logs: TimestampedLog<T>[], value: (l: TimestampedLog<T>) => number, months = 6, now = Date.now()): { label: string; value: number }[] {
  const out: { label: string; value: number; key: string }[] = [];
  const base = new Date(now);
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
    out.push({ key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`, label: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }), value: 0 });
  }
  for (const l of logs) {
    const d = new Date(l.timestamp * 1000);
    const bucket = out.find((b) => b.key === `${d.getUTCFullYear()}-${d.getUTCMonth()}`);
    if (bucket) bucket.value += value(l);
  }
  return out.map(({ label, value }) => ({ label, value }));
}

export function bucketByDay<T>(logs: TimestampedLog<T>[], value: (l: TimestampedLog<T>) => number, days: number, now = Date.now()): number[] {
  const dayMs = 86_400_000;
  const end = Math.floor(now / dayMs);
  const out = Array.from({ length: days }, () => 0);
  for (const l of logs) {
    const idx = days - 1 - (end - Math.floor((l.timestamp * 1000) / dayMs));
    if (idx >= 0 && idx < days) out[idx]! += value(l);
  }
  return out;
}
