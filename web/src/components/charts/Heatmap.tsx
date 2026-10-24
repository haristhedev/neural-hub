"use client";
import { useRef } from "react";
import { gsap, useGSAP, motion } from "@/lib/motion/gsap";

/**
 * Inference activity heat-map (design: "Inference Activity Map"). One cell per day, laid out like a contribution graph:
 * 7 rows (days) × N columns (weeks), intensity 0..4. Values are oldest → newest.
 */
export function Heatmap({ values }: { values: number[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const weeks = Math.max(1, Math.ceil(values.length / 7));
  const max = Math.max(1, ...values);
  const level = (v: number) => (v === 0 ? 0 : Math.min(4, 1 + Math.floor((v / max) * 3.999)));
  const shade = ["#181b2b", "#232744", "#3b2a78", "#6c46d6", "#8b5cf6"];
  useGSAP(() => { motion(() => { gsap.from(ref.current!.querySelectorAll("[data-cell]"), { scale: 0.2, opacity: 0, stagger: { each: 0.004, from: "start" }, duration: 0.45, ease: "back.out(2)", scrollTrigger: { trigger: ref.current, start: "top 92%", once: true } }); }); }, { scope: ref, dependencies: [values.join(",")] });
  return (
    <div>
      <div ref={ref} className="grid gap-1" style={{ gridAutoFlow: "column", gridTemplateRows: "repeat(7, minmax(0, 1fr))", gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }} role="img" aria-label={`Daily inference activity, last ${values.length} days`}>
        {values.map((v, i) => <div key={i} data-cell title={`${v.toLocaleString()} calls`} className="aspect-square rounded-[3px]" style={{ background: shade[level(v)] }} />)}
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-ink-faint">
        Less {shade.map((c) => <span key={c} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: c }} />)} More
      </div>
    </div>
  );
}
