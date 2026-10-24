"use client";
import { useRef } from "react";
import { gsap, useGSAP, motion } from "@/lib/motion/gsap";

export interface Slice { label: string; value: number; color: string }

export function Donut({ slices, center, sub }: { slices: Slice[]; center: string; sub: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const R = 70, C = 2 * Math.PI * R;
  let acc = 0;
  useGSAP(() => {
    motion(() => {
      gsap.from(ref.current!.querySelectorAll("circle[data-slice]"), { strokeDasharray: `0 ${C}`, duration: 1.2, stagger: 0.15, ease: "power3.out", scrollTrigger: { trigger: ref.current, start: "top 90%", once: true } });
    });
  }, { scope: ref, dependencies: [slices.map((s) => s.value).join(",")] });
  return (
    <svg ref={ref} viewBox="0 0 200 200" className="mx-auto h-48 w-48" role="img" aria-label={`${center} ${sub}`}>
      <g transform="rotate(-90 100 100)">
        <circle cx="100" cy="100" r={R} fill="none" stroke="#171a29" strokeWidth="22" />
        {slices.map((s) => {
          const len = (s.value / total) * C;
          const el = <circle key={s.label} data-slice cx="100" cy="100" r={R} fill="none" stroke={s.color} strokeWidth="22" strokeDasharray={`${Math.max(0, len - 2)} ${C - Math.max(0, len - 2)}`} strokeDashoffset={-acc} />;
          acc += len;
          return el;
        })}
      </g>
      <text x="100" y="98" textAnchor="middle" className="fill-ink font-display text-[22px] font-bold">{center}</text>
      <text x="100" y="118" textAnchor="middle" className="fill-ink-faint font-mono text-[9px] uppercase">{sub}</text>
    </svg>
  );
}
