"use client";
import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { gsap } from "@/lib/motion/gsap";

export interface TabDef<T extends string> { id: T; label: string; badge?: string | number }

/** Tabs with a GSAP-animated underline that slides between items. */
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: TabDef<T>[]; value: T; onChange: (id: T) => void; className?: string }) {
  const listRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const inited = useRef(false);

  useLayoutEffect(() => {
    const list = listRef.current;
    const bar = barRef.current;
    const active = list?.querySelector<HTMLElement>(`[data-tab="${value}"]`);
    if (!list || !bar || !active) return;
    const to = { x: active.offsetLeft, width: active.offsetWidth };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!inited.current || reduced) { gsap.set(bar, to); inited.current = true; }
    else gsap.to(bar, { ...to, duration: 0.45, ease: "power3.out" });
  }, [value, tabs.length]);

  return (
    <div ref={listRef} role="tablist" className={cn("relative flex gap-1 overflow-x-auto border-b border-line scroll-thin", className)}>
      {tabs.map((t) => (
        <button
          key={t.id} role="tab" data-tab={t.id} aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cn("flex items-center gap-2 whitespace-nowrap px-4 pb-3 pt-2 text-sm font-medium transition-colors", value === t.id ? "text-ink" : "text-ink-dim hover:text-ink")}
        >
          {t.label}
          {t.badge !== undefined && <span className="rounded bg-accent-lo px-1.5 py-0.5 font-mono text-[10px] text-accent-hi">{t.badge}</span>}
        </button>
      ))}
      <span ref={barRef} className="absolute bottom-0 left-0 h-0.5 rounded-full bg-accent" style={{ width: 0 }} />
    </div>
  );
}
