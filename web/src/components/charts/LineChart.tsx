"use client";
import { useId, useRef, useState } from "react";
import { gsap, useGSAP, motion } from "@/lib/motion/gsap";

export interface Point { label: string; value: number }

/** Dependency-free SVG line/area chart; the line draws itself in with GSAP DrawSVG. Hover shows a crosshair + tooltip. */
export function LineChart({ data, format = (n) => n.toLocaleString(), height = 220, ariaLabel }: { data: Point[]; format?: (n: number) => string; height?: number; ariaLabel: string }) {
  const W = 600, H = 220, PAD = 16;
  const id = useId().replace(/:/g, "");
  const root = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const max = Math.max(1, ...data.map((d) => d.value)) * 1.1;
  const x = (i: number) => PAD + (data.length <= 1 ? 0 : (i / (data.length - 1)) * (W - PAD * 2));
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(" ");
  const area = data.length ? `${line} L${x(data.length - 1)} ${H - PAD} L${x(0)} ${H - PAD} Z` : "";
  const sig = data.map((d) => d.value).join(",");

  useGSAP(
    () => {
      const el = root.current;
      if (!el || !data.length) return;
      motion(
        () => {
          const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top 90%", once: true } });
          tl.fromTo(el.querySelector("[data-line]"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 1.4, ease: "power2.inOut" })
            .fromTo(el.querySelector("[data-area]"), { opacity: 0 }, { opacity: 1, duration: 0.8 }, "<0.4")
            .fromTo(el.querySelectorAll("[data-dot]"), { scale: 0, transformOrigin: "50% 50%" }, { scale: 1, stagger: 0.08, duration: 0.4, ease: "back.out(2)" }, "<0.2");
        },
        () => { gsap.set(el.querySelectorAll("[data-line],[data-area],[data-dot]"), { clearProps: "all" }); },
      );
    },
    { scope: root, dependencies: [sig] },
  );

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    data.forEach((_, i) => { if (Math.abs(x(i) - rel) < Math.abs(x(best) - rel)) best = i; });
    setHover(best);
  };

  return (
    <div ref={root} className="relative" style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full overflow-visible" role="img" aria-label={ariaLabel} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8b5cf6" stopOpacity=".35" /><stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((t) => <line key={t} x1={PAD} x2={W - PAD} y1={y(max * t / 1.1)} y2={y(max * t / 1.1)} stroke="#232740" strokeOpacity=".6" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />)}
        <path data-area d={area} fill={`url(#g${id})`} />
        <path data-line d={line} fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD} y2={H - PAD} stroke="#a78bfa" strokeOpacity=".5" vectorEffect="non-scaling-stroke" />}
      </svg>
      {/* dots as HTML so they stay circular under preserveAspectRatio="none" */}
      {data.map((d, i) => (
        <span key={d.label + i} data-dot className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-bg-raised" style={{ left: `${(x(i) / W) * 100}%`, top: `${(y(d.value) / H) * 100}%`, opacity: hover === null || hover === i ? 1 : 0.4 }} />
      ))}
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-line bg-bg-raised px-2.5 py-1.5 font-mono text-xs shadow-xl" style={{ left: `${(x(hover) / W) * 100}%`, top: `calc(${(y(data[hover]!.value) / H) * 100}% - 46px)` }}>
          <div className="text-ink-faint">{data[hover]!.label}</div><div>{format(data[hover]!.value)}</div>
        </div>
      )}
      <div className="absolute inset-x-0 -bottom-6 flex justify-between px-1 font-mono text-[10px] text-ink-faint" aria-hidden>
        {data.map((d, i) => <span key={d.label + i}>{d.label}</span>)}
      </div>
    </div>
  );
}
