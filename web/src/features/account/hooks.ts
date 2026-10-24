"use client";
import type { Address } from "viem";
import { useBalance } from "wagmi";
import { useChainQuery } from "@/hooks/useChainQuery";
import { useAppChain } from "@/hooks/useAppChain";
import { TIERS } from "@/lib/web3/contracts";

export function useTokenBalance(owner?: Address) {
  return useChainQuery(["token-balance", owner], ({ client, c }) => client.readContract({ ...c.paymentToken, functionName: "balanceOf", args: [owner!] }), { enabled: !!owner });
}

export function useAllowance(owner?: Address, spender?: Address) {
  return useChainQuery(["allowance", owner, spender], ({ client, c }) => client.readContract({ ...c.paymentToken, functionName: "allowance", args: [owner!, spender!] }), { enabled: !!owner && !!spender });
}

export function useCredits(owner?: Address) {
  return useChainQuery(["credits", owner], ({ client, c }) => client.readContract({ ...c.marketplace, functionName: "credits", args: [owner!] }), { enabled: !!owner });
}

export function usePending(owner?: Address) {
  return useChainQuery(["pending", owner], ({ client, c }) => client.readContract({ ...c.marketplace, functionName: "pending", args: [owner!] }), { enabled: !!owner });
}

export function useFaucetCooldown(owner?: Address) {
  return useChainQuery(["faucet", owner], ({ client, c }) => client.readContract({ ...c.paymentToken, functionName: "lastFaucetClaim", args: [owner!] }), { enabled: !!owner });
}

export function useNativeBalance() {
  const { address, chainId } = useAppChain();
  return useBalance({ address, chainId, query: { enabled: !!address, refetchInterval: 15_000 } });
}

export interface LicenseHolding {
  modelId: number;
  tier: 1 | 2 | 3;
  tokenId: bigint;
  expiresAt: number; // 0 = perpetual
  valid: boolean;
}

/** Which tiers of `modelId` the account holds (ERC-1155 balance + on-chain expiry). */
export function useModelLicenses(modelId: number | undefined, owner?: Address) {
  return useChainQuery(
    ["licenses", modelId, owner],
    async ({ client, c }) => {
      const out: LicenseHolding[] = [];
      await Promise.all(
        TIERS.map(async (t) => {
          const tokenId = await client.readContract({ ...c.licenses, functionName: "licenseId", args: [BigInt(modelId!), t.id] });
          const [bal, exp, valid] = await Promise.all([
            client.readContract({ ...c.licenses, functionName: "balanceOf", args: [owner!, tokenId] }),
            client.readContract({ ...c.licenses, functionName: "expiryOf", args: [owner!, tokenId] }),
            client.readContract({ ...c.licenses, functionName: "isLicenseValid", args: [owner!, BigInt(modelId!), t.id] }),
          ]);
          if (bal > 0n) out.push({ modelId: modelId!, tier: t.id, tokenId, expiresAt: Number(exp), valid });
        }),
      );
      return out.sort((a, b) => a.tier - b.tier);
    },
    { enabled: modelId !== undefined && !!owner },
  );
}

/** Every license the account holds across the whole catalogue, in a single batch. */
export function useAllLicenses(owner: Address | undefined, modelCount: number) {
  return useChainQuery(
    ["all-licenses", owner, modelCount],
    async ({ client, c }) => {
      const holdings: LicenseHolding[] = [];
      await Promise.all(
        Array.from({ length: modelCount }, (_, i) => i + 1).flatMap((modelId) =>
          TIERS.map(async (t) => {
            const tokenId = await client.readContract({ ...c.licenses, functionName: "licenseId", args: [BigInt(modelId), t.id] });
            const bal = await client.readContract({ ...c.licenses, functionName: "balanceOf", args: [owner!, tokenId] });
            if (bal === 0n) return;
            const [exp, valid] = await Promise.all([
              client.readContract({ ...c.licenses, functionName: "expiryOf", args: [owner!, tokenId] }),
              client.readContract({ ...c.licenses, functionName: "isLicenseValid", args: [owner!, BigInt(modelId), t.id] }),
            ]);
            holdings.push({ modelId, tier: t.id, tokenId, expiresAt: Number(exp), valid });
          }),
        ),
      );
      return holdings.sort((a, b) => a.modelId - b.modelId || a.tier - b.tier);
    },
    { enabled: !!owner && modelCount > 0 },
  );
}

/** Active platform plan pass (modelId 0): 0 = none, 1 = Pro, 2 = Team. */
export function usePlanPass(owner?: Address) {
  return useChainQuery(
    ["plan-pass", owner],
    async ({ client, c }) => {
      for (const plan of [2, 1] as const) {
        const valid = await client.readContract({ ...c.licenses, functionName: "isLicenseValid", args: [owner!, 0n, plan] });
        if (valid) {
          const id = await client.readContract({ ...c.licenses, functionName: "licenseId", args: [0n, plan] });
          const exp = await client.readContract({ ...c.licenses, functionName: "expiryOf", args: [owner!, id] });
          return { plan, expiresAt: Number(exp) };
        }
      }
      return { plan: 0 as const, expiresAt: 0 };
    },
    { enabled: !!owner },
  );
}
