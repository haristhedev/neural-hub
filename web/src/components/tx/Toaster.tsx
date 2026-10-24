"use client";
import { useEffect, useRef } from "react";
import { gsap, motion } from "@/lib/motion/gsap";
import { useUi, type Toast } from "@/lib/store/ui";
import { explorerTxUrl, KNOWN_CHAINS } from "@/lib/web3/chains";
import { shortAddress } from "@/lib/web3/format";
import { cn } from "@/lib/utils";

function ToastItem({ t }: { t: Toast }) {
  const dismiss = useUi((s) => s.dismissToast);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mm = motion(() => { gsap.fromTo(el, { x: 48, opacity: 0, scale: 0.96 }, { x: 0, opacity: 1, scale: 1, duration: 0.5, ease: "expo.out" }); });
    const timer = t.kind === "pending" ? undefined : setTimeout(() => {
      gsap.to(el, { x: 48, opacity: 0, duration: 0.3, onComplete: () => dismiss(t.id) });
    }, t.kind === "error" ? 9_000 : 6_000);
    return () => { clearTimeout(timer); mm.revert(); };
  }, [t.id, t.kind, dismiss]);

  const link = t.hash ? explorerTxUrl(t.chainId ? KNOWN_CHAINS[t.chainId] : undefined, t.hash) : undefined;
  return (
    <div ref={ref} role={t.kind === "error" ? "alert" : "status"} className={cn("pointer-events-auto w-80 rounded-xl border bg-bg-raised/95 p-3.5 shadow-2xl backdrop-blur", t.kind === "success" && "border-ok/40", t.kind === "error" && "border-bad/40", t.kind === "info" && "border-line", t.kind === "pending" && "border-accent/40")}>
      <div className="flex items-start gap-2.5">
        <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", t.kind === "success" ? "bg-ok" : t.kind === "error" ? "bg-bad" : "bg-accent")} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{t.title}</div>
          {t.message && <div className="mt-0.5 text-xs text-ink-dim">{t.message}</div>}
          {t.hash && (link ? <a href={link} target="_blank" rel="noopener noreferrer" className="num mt-1 inline-block text-[11px] text-accent-hi hover:underline">{shortAddress(t.hash, 8, 6)} ↗</a> : <span className="num mt-1 inline-block text-[11px] text-ink-faint">{shortAddress(t.hash, 8, 6)}</span>)}
        </div>
        <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-ink-faint hover:text-ink">✕</button>
      </div>
    </div>
  );
}

export function Toaster() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2" aria-live="polite">
      {toasts.map((t) => <ToastItem key={t.id} t={t} />)}
    </div>
  );
}
