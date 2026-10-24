"use client";
import { useRef } from "react";
import { gsap, useGSAP, motion } from "@/lib/motion/gsap";

/** Semi-circular gauge for prepaid credit burn-down. The arc tweens whenever `fraction` changes (live metering). */
export function Gauge({ fraction, label, value }: { fraction: number; label: string; value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const f = Math.min(1, Math.max(0, fraction));
  const R = 80, L = Math.PI * R;
  const color = f < 0.15 ? "#ef4444" : f < 0.4 ? "#f59e0b" : "#8b5cf6";
  useGSAP(() => {
    const arc = ref.current!.querySelector("[data-arc]");
    motion(
      () => { gsap.to(arc, { strokeDashoffset: L * (1 - f), stroke: color, duration: 0.9, ease: "power3.out" }); },
      () => { gsap.set(arc, { strokeDashoffset: L * (1 - f), stroke: color }); },
    );
  }, { scope: ref, dependencies: [f] });
  return (
    <svg ref={ref} viewBox="0 0 200 120" className="w-full max-w-xs" role="img" aria-label={`${label}: ${value}`}>
      <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#171a29" strokeWidth="14" strokeLinecap="round" />
      <path data-arc d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" strokeDasharray={L} strokeDashoffset={L} />
      <text x="100" y="86" textAnchor="middle" className="fill-ink font-display text-[24px] font-bold">{value}</text>
      <text x="100" y="106" textAnchor="middle" className="fill-ink-faint font-mono text-[8px] uppercase tracking-widest">{label}</text>
    </svg>
  );
}
