"use client";
import { useQuery } from "@tanstack/react-query";
import type { PublicClient } from "viem";
import { usePublicClient } from "wagmi";
import type { Contracts } from "@/lib/web3/contracts";
import { useAppChain } from "./useAppChain";

interface Ctx { client: PublicClient; c: Contracts; chainId: number }

/**
 * Typed wrapper around useQuery for "read something from the app chain".
 * All keys are namespaced `["nh", chainId, …]` so one invalidate after any transaction refreshes everything.
 */
export function useChainQuery<T>(
  key: readonly unknown[],
  fn: (ctx: Ctx) => Promise<T>,
  opts: { enabled?: boolean; refetchInterval?: number; staleTime?: number } = {},
) {
  const { chainId, contracts } = useAppChain();
  const client = usePublicClient({ chainId }) as PublicClient | undefined;
  return useQuery({
    queryKey: ["nh", chainId, ...key],
    enabled: Boolean(client && contracts) && (opts.enabled ?? true),
    refetchInterval: opts.refetchInterval,
    staleTime: opts.staleTime ?? 10_000,
    queryFn: () => fn({ client: client!, c: contracts!, chainId }),
  });
}
