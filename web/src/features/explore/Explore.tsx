"use client";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Flip, gsap, motion } from "@/lib/motion/gsap";
import { Skeleton, EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { ModelCard } from "@/components/nft/ModelCard";
import { useModelViews, type ModelView } from "@/features/models/hooks";
import { useUi, type ExploreFilters } from "@/lib/store/ui";
import { CATEGORY_LONG } from "@/lib/web3/contracts";
import { usdNumber } from "@/lib/web3/format";
import { useAccount } from "wagmi";
import { useAllLicenses } from "@/features/account/hooks";
import { cn } from "@/lib/utils";

export function matches(m: ModelView, f: ExploreFilters, licensed: Set<number>) {
  const q = f.query.trim().toLowerCase();
  const hay = `${m.meta?.name ?? ""} ${m.meta?.neuralhub.handle ?? ""} ${(m.meta?.neuralhub.tags ?? []).join(" ")}`.toLowerCase();
  if (q && !hay.includes(q)) return false;
  if (f.category !== null && m.category !== f.category) return false;
  if (usdNumber(m.pricing.commercial) > f.maxPrice) return false;
  if (f.licensedOnly && !licensed.has(m.id)) return false;
  return true;
}

export function sortModels(list: ModelView[], sort: ExploreFilters["sort"]) {
  const by: Record<ExploreFilters["sort"], (a: ModelView, b: ModelView) => number> = {
    popular: (a, b) => Number(b.totalCalls - a.totalCalls),
    "price-asc": (a, b) => Number(a.pricing.commercial - b.pricing.commercial),
    "price-desc": (a, b) => Number(b.pricing.commercial - a.pricing.commercial),
    newest: (a, b) => b.createdAt - a.createdAt || b.id - a.id,
  };
  return [...list].sort(by[sort]);
}

export function Explore() {
  const { views, isLoading, isError } = useModelViews();
  const { address } = useAccount();
  const filters = useUi((s) => s.filters);
  const setFilters = useUi((s) => s.setFilters);
  const resetFilters = useUi((s) => s.resetFilters);
  const params = useSearchParams();
  const grid = useRef<HTMLDivElement>(null);
  const flipState = useRef<Flip.FlipState | null>(null);
  const licenses = useAllLicenses(address, views.length);

  useEffect(() => { const q = params.get("q"); if (q !== null) setFilters({ query: q }); }, [params, setFilters]);

  const licensed = useMemo(() => new Set((licenses.data ?? []).filter((l) => l.valid).map((l) => l.modelId)), [licenses.data]);
  const ordered = useMemo(() => sortModels(views, filters.sort), [views, filters.sort]);
  const visible = useMemo(() => new Set(ordered.filter((m) => matches(m, filters, licensed)).map((m) => m.id)), [ordered, filters, licensed]);

  const counts = useMemo(() => {
    const c = new Map<number, number>();
    views.forEach((m) => c.set(m.category, (c.get(m.category) ?? 0) + 1));
    return c;
  }, [views]);

  /** Capture card positions *before* React re-renders with the new filter, then FLIP to the new layout. */
  const update = (patch: Partial<ExploreFilters>) => {
    if (grid.current) flipState.current = Flip.getState(grid.current.querySelectorAll("[data-flip-card]"));
    setFilters(patch);
  };

  useLayoutEffect(() => {
    const state = flipState.current;
    if (!state || !grid.current) return;
    flipState.current = null;
    const mm = motion(() => {
      Flip.from(state, {
        duration: 0.6, ease: "power3.inOut", absolute: true, stagger: 0.025, scale: false,
        onEnter: (els) => gsap.fromTo(els, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.5, delay: 0.15 }),
        onLeave: (els) => gsap.to(els, { opacity: 0, scale: 0.9, duration: 0.3 }),
      });
    });
    return () => mm.revert();
  }, [filters, licensed]);

  const shownCount = visible.size;

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[260px_1fr]">
      <aside aria-label="Filters" className="space-y-8 lg:sticky lg:top-24 lg:self-start">
        <div>
          <div className="label-mono mb-3">Categories</div>
          <ul className="space-y-1">
            <li><button onClick={() => update({ category: null })} className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm", filters.category === null ? "bg-accent-lo text-accent-hi" : "text-ink-dim hover:bg-white/5")}>All models<span className="num text-xs">{views.length}</span></button></li>
            {CATEGORY_LONG.map((c, i) => counts.get(i) ? (
              <li key={c}><button onClick={() => update({ category: filters.category === i ? null : i })} className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm", filters.category === i ? "bg-accent-lo text-accent-hi" : "text-ink-dim hover:bg-white/5")} aria-pressed={filters.category === i}>{c}<span className="num text-xs">{counts.get(i)}</span></button></li>
            ) : null)}
          </ul>
        </div>
        <div>
          <label htmlFor="max-price" className="label-mono mb-3 block">Max commercial price</label>
          <input id="max-price" type="range" min={50} max={5000} step={50} value={filters.maxPrice} onChange={(e) => update({ maxPrice: Number(e.target.value) })} className="w-full accent-[#8b5cf6]" />
          <div className="num mt-1 text-sm text-ink-dim">≤ ${filters.maxPrice.toLocaleString()}</div>
        </div>
        <label className="flex cursor-pointer items-center gap-3 text-sm text-ink-dim">
          <input type="checkbox" checked={filters.licensedOnly} disabled={!address} onChange={(e) => update({ licensedOnly: e.target.checked })} className="h-4 w-4 accent-[#8b5cf6]" />
          Only models I hold a license for {!address && <span className="text-xs text-ink-faint">(connect wallet)</span>}
        </label>
        <Button variant="ghost" size="sm" onClick={() => { if (grid.current) flipState.current = Flip.getState(grid.current.querySelectorAll("[data-flip-card]")); resetFilters(); }}>Reset filters</Button>
      </aside>

      <section aria-live="polite">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-bold">Explore AI computes</h1>
            <p className="mt-1 text-ink-dim">Discover secure, decentralised models ready to license.</p>
          </div>
          <div className="flex gap-3">
            <label className="sr-only" htmlFor="q">Search</label>
            <Input id="q" value={filters.query} onChange={(e) => update({ query: e.target.value })} placeholder="Search…" className="w-48" />
            <label className="sr-only" htmlFor="sort">Sort</label>
            <select id="sort" value={filters.sort} onChange={(e) => update({ sort: e.target.value as ExploreFilters["sort"] })} className="rounded-lg border border-line bg-bg-raised px-3 py-2 text-sm">
              <option value="popular">Sort: Most used</option><option value="newest">Sort: Newest</option><option value="price-asc">Price: Low → High</option><option value="price-desc">Price: High → Low</option>
            </select>
          </div>
        </div>

        {isError && <p className="mt-8 rounded-xl border border-bad/30 bg-bad/10 p-4 text-sm text-bad">Could not load models from the chain. Check your RPC connection.</p>}
        <div ref={grid} className="relative mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {isLoading && Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-48" />)}
          {ordered.map((m) => <ModelCard key={m.id} model={m} hidden={!visible.has(m.id)} />)}
        </div>
        {!isLoading && !isError && shownCount === 0 && <EmptyState title="No models match these filters" body="Try widening the price range or clearing the search." action={<Button variant="secondary" onClick={resetFilters}>Reset filters</Button>} />}
        {!isLoading && shownCount > 0 && <p className="mt-6 font-mono text-xs text-ink-faint">Showing {shownCount} of {views.length} models</p>}
      </section>
    </div>
  );
}
