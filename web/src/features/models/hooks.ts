"use client";
import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useChainQuery } from "@/hooks/useChainQuery";
import { fetchAllModels, fetchModelRecord, type ModelRecord } from "@/lib/web3/read";
import { loadModelMetadata, type ModelMetadata } from "@/lib/web3/ipfs";
import { useAppChain } from "@/hooks/useAppChain";

export function useModels() {
  return useChainQuery(["models"], ({ client, c }) => fetchAllModels(client, c), { staleTime: 15_000 });
}

export function useModel(id: number) {
  return useChainQuery(["model", id], ({ client, c }) => fetchModelRecord(client, c, id), { enabled: Number.isInteger(id) && id > 0 });
}

/** Metadata is immutable per URI, so it is cached forever under a key that is *not* invalidated by tx refreshes. */
export function useModelMetadata(uri?: string) {
  return useQuery({
    queryKey: ["nh-meta", "metadata", uri],
    enabled: !!uri,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 30,
    retry: 1,
    queryFn: ({ signal }) => loadModelMetadata(uri!, { signal }),
  });
}

export interface ModelView extends ModelRecord {
  meta?: ModelMetadata;
  metaLoading: boolean;
}

export function useModelViews() {
  const { chainId } = useAppChain();
  const models = useModels();
  const metas = useQueries({
    queries: (models.data ?? []).map((m) => ({
      queryKey: ["nh-meta", "metadata", m.tokenURI],
      staleTime: Infinity,
      retry: 1,
      queryFn: ({ signal }: { signal: AbortSignal }) => loadModelMetadata(m.tokenURI, { signal }),
    })),
  });
  // A fixed-size dependency: spreading `metaData` into the deps array changes its length as models load,
  // which React forbids. `dataUpdatedAt` bumps whenever any metadata query resolves or refetches.
  const metaVersion = metas.map((m) => `${m.dataUpdatedAt}:${m.isLoading ? 1 : 0}`).join(",");
  const views = useMemo<ModelView[]>(
    () => (models.data ?? []).map((m, i) => ({ ...m, meta: metas[i]?.data, metaLoading: metas[i]?.isLoading ?? true })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [models.data, metaVersion],
  );
  return { ...models, views, chainId };
}
