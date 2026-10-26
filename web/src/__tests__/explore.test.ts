import { describe, expect, it } from "vitest";
import { matches, sortModels } from "@/features/explore/Explore";
import { DEFAULT_FILTERS } from "@/lib/store/ui";
import type { ModelView } from "@/features/models/hooks";

const mk = (id: number, o: Partial<ModelView> & { name?: string; commercial?: bigint; tags?: string[] } = {}): ModelView => ({
  id, owner: "0x0000000000000000000000000000000000000001", creator: "0x0000000000000000000000000000000000000001", category: o.category ?? 0, version: "1.0.0", createdAt: o.createdAt ?? id, tokenURI: "",
  pricing: { personal: 0n, commercial: o.commercial ?? 100_000_000n, enterprise: 0n, perCall: 0n, listed: true }, split: { partner: "0x0000000000000000000000000000000000000000", partnerBps: 0 },
  totalCalls: o.totalCalls ?? 0n, totalRevenue: 0n, metaLoading: false,
  meta: { name: o.name ?? `Model ${id}`, description: "", neuralhub: { handle: "dev", framework: "PyTorch", params: "7B", tags: o.tags ?? [], rating: 4, benchmarks: [] } },
});

describe("explore filtering", () => {
  const list = [mk(1, { name: "Aura Llama", tags: ["chat"], category: 0 }), mk(2, { name: "Synth Diffusion", category: 1, commercial: 900_000_000n })];
  it("filters by query, category and price cap", () => {
    expect(list.filter((m) => matches(m, { ...DEFAULT_FILTERS, query: "llama" }, new Set()))).toHaveLength(1);
    expect(list.filter((m) => matches(m, { ...DEFAULT_FILTERS, category: 1 }, new Set()))).toHaveLength(1);
    expect(list.filter((m) => matches(m, { ...DEFAULT_FILTERS, maxPrice: 500 }, new Set())).map((m) => m.id)).toEqual([1]);
  });
  it("licensed-only uses the license set", () => {
    expect(list.filter((m) => matches(m, { ...DEFAULT_FILTERS, licensedOnly: true }, new Set([2]))).map((m) => m.id)).toEqual([2]);
  });
  it("sorts without mutating the input", () => {
    const l = [mk(1, { totalCalls: 5n }), mk(2, { totalCalls: 50n })];
    expect(sortModels(l, "popular").map((m) => m.id)).toEqual([2, 1]);
    expect(l.map((m) => m.id)).toEqual([1, 2]);
    expect(sortModels(list, "price-desc")[0]!.id).toBe(2);
  });
});
