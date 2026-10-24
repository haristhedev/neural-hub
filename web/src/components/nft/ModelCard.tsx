"use client";
import Link from "next/link";
import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/motion/gsap";
import { Badge } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Card";
import { CATEGORIES } from "@/lib/web3/contracts";
import { compact, formatUsd, shortAddress } from "@/lib/web3/format";
import type { ModelView } from "@/features/models/hooks";
import { cn } from "@/lib/utils";

/** Pointer-follow tilt + spotlight. Pointer-fine + motion-allowed only. */
function useTilt(ref: React.RefObject<HTMLElement | null>) {
  useGSAP(() => {
    const el = ref.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference) and (pointer: fine)", () => {
      const rx = gsap.quickTo(el, "rotationX", { duration: 0.5, ease: "power3.out" });
      const ry = gsap.quickTo(el, "rotationY", { duration: 0.5, ease: "power3.out" });
      gsap.set(el, { transformPerspective: 900 });
      const move = (e: MouseEvent) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        ry(px * 7); rx(-py * 7);
        el.style.setProperty("--mx", `${(px + 0.5) * 100}%`); el.style.setProperty("--my", `${(py + 0.5) * 100}%`);
      };
      const leave = () => { rx(0); ry(0); };
      el.addEventListener("mousemove", move); el.addEventListener("mouseleave", leave);
      return () => { el.removeEventListener("mousemove", move); el.removeEventListener("mouseleave", leave); };
    });
  }, { scope: ref });
}

export function ModelCard({ model, hidden }: { model: ModelView; hidden?: boolean }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useTilt(ref);
  const m = model.meta;
  return (
    <Link
      ref={ref} href={`/models/${model.id}`} data-flip-card data-id={model.id}
      className={cn("group relative block overflow-hidden rounded-2xl border border-line bg-surface/90 p-5 transition-colors hover:border-accent/70 will-change-transform", hidden && "hidden")}
      style={{ backgroundImage: "radial-gradient(260px circle at var(--mx,50%) var(--my,0%), rgba(139,92,246,.12), transparent 60%)" }}
    >
      <div className="flex items-center justify-between">
        <Badge>{CATEGORIES[model.category] ?? "Model"}</Badge>
        <span className="num text-[11px] text-ink-faint">#{model.id} · {shortAddress(model.owner, 4, 4)}</span>
      </div>
      {model.metaLoading ? <Skeleton className="mt-5 h-6 w-3/4" /> : <h3 className="mt-5 font-display text-xl font-semibold leading-tight">{m?.name ?? `Model #${model.id}`}</h3>}
      <p className="mt-1 text-sm text-ink-dim">by <span className="text-accent-hi">@{m?.neuralhub.handle ?? shortAddress(model.creator)}</span></p>
      <div className="mt-6 flex items-end justify-between border-t border-line-soft pt-4">
        <div className="flex items-center gap-4 font-mono text-xs text-ink-dim">
          <span className="flex items-center gap-1"><span className="text-warn">★</span>{m?.neuralhub.rating?.toFixed(1) ?? "—"}</span>
          <span title="API calls served">⚡ {compact(Number(model.totalCalls))}</span>
        </div>
        <div className="text-right">
          <div className="label-mono">Commercial license</div>
          <div className="num text-lg font-bold">{formatUsd(model.pricing.commercial, { maxFraction: 0 })}</div>
        </div>
      </div>
    </Link>
  );
}

