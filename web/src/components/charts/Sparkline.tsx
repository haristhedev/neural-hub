"use client";
import { useRef } from "react";
import { gsap, useGSAP, motion } from "@/lib/motion/gsap";

export function Sparkline({ values, width = 120, height = 32, color = "#8b5cf6" }: { values: number[]; width?: number; height?: number; color?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const max = Math.max(1, ...values), min = Math.min(...values, 0);
  const pts = values.map((v, i) => `${i ? "L" : "M"}${((i / Math.max(1, values.length - 1)) * (width - 4) + 2).toFixed(1)} ${(height - 3 - ((v - min) / (max - min || 1)) * (height - 6)).toFixed(1)}`).join(" ");
  useGSAP(() => { motion(() => { gsap.fromTo(ref.current!.querySelector("path"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 1, ease: "power2.out", scrollTrigger: { trigger: ref.current, start: "top 95%", once: true } }); }); }, { scope: ref, dependencies: [values.join(",")] });
  return <svg ref={ref} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden><path d={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
