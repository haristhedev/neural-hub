"use client";
import { useId, useRef } from "react";
import { gsap, useGSAP, motion } from "@/lib/motion/gsap";

/**
 * Hero motion graphic: the NeuralHub value loop.
 *   consumer ──NHUSD──▶ marketplace ──ERC-1155 license──▶ consumer
 *                        └─ royalty split 60 / 30 / 10 ─▶ creator · compute partner · treasury
 * Built with GSAP MotionPath (packets travelling along the wires), DrawSVG (wires drawing in), and a looping master timeline.
 */
const N = {
  consumer: { x: 70, y: 220, label: "Consumer", sub: "wallet" },
  market: { x: 270, y: 220, label: "Marketplace", sub: "contract" },
  license: { x: 270, y: 70, label: "License", sub: "ERC-1155" },
  model: { x: 270, y: 370, label: "Model NFT", sub: "ERC-721" },
  creator: { x: 470, y: 80, label: "Creator", sub: "60%" },
  partner: { x: 470, y: 220, label: "Compute", sub: "30%" },
  treasury: { x: 470, y: 360, label: "Treasury", sub: "10%" },
} as const;
type K = keyof typeof N;

const wires: { id: string; from: K; to: K }[] = [
  { id: "cm", from: "consumer", to: "market" },
  { id: "ml", from: "market", to: "license" },
  { id: "nm", from: "model", to: "market" },
  { id: "mc", from: "market", to: "creator" },
  { id: "mp", from: "market", to: "partner" },
  { id: "mt", from: "market", to: "treasury" },
];
const d = (a: K, b: K) => {
  const A = N[a], B = N[b];
  const mx = (A.x + B.x) / 2;
  return A.x === B.x ? `M${A.x} ${A.y} L${B.x} ${B.y}` : `M${A.x} ${A.y} C${mx} ${A.y} ${mx} ${B.y} ${B.x} ${B.y}`;
};

export function HeroNetwork({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const root = useRef<SVGSVGElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const q = (s: string) => el.querySelector(s);
      const qa = (s: string) => el.querySelectorAll(s);
      motion(
        () => {
          // wires draw in (DrawSVG), then a dashed "flow" overlay fades in and marches along them
          gsap.from(qa("[data-wire]"), { drawSVG: "0%", duration: 1.2, stagger: 0.12, ease: "power2.inOut" });
          gsap.fromTo(qa("[data-flow]"), { opacity: 0 }, { opacity: 1, duration: 0.6, delay: 1.4 });
          gsap.to(qa("[data-flow]"), { strokeDashoffset: -24, duration: 1.8, repeat: -1, ease: "none" });
          // nodes pop in and float. They animate an *inner* group so GSAP never fights the static translate() that positions them.
          gsap.from(qa("[data-node]"), { scale: 0, transformOrigin: "0px 0px", duration: 0.7, stagger: 0.09, ease: "back.out(1.8)", delay: 0.2 });
          qa("[data-node]").forEach((n, i) => gsap.to(n, { y: i % 2 ? 4 : -4, duration: 2.4 + i * 0.3, repeat: -1, yoyo: true, ease: "sine.inOut", delay: 1 }));

          const travel = (pkt: string, wire: string, dur: number, at: gsap.Position) =>
            tl.fromTo(q(pkt), { autoAlpha: 1 }, { motionPath: { path: q(`#${uid}-${wire}`) as SVGPathElement, align: q(`#${uid}-${wire}`) as SVGPathElement, alignOrigin: [0.5, 0.5] }, duration: dur, ease: "power1.inOut" }, at)
              .to(q(pkt), { autoAlpha: 0, duration: 0.15 }, `>-0.05`);
          const pulse = (node: string, at: gsap.Position) => tl.fromTo(q(`[data-ring="${node}"]`), { scale: 0.6, opacity: 0.9, transformOrigin: "50% 50%" }, { scale: 1.8, opacity: 0, duration: 0.9, ease: "power2.out" }, at);

          const tl = gsap.timeline({ repeat: -1, repeatDelay: 1, delay: 1.4 });
          gsap.set(qa("[data-pkt]"), { autoAlpha: 0 });
          pulse("consumer", 0);
          travel("[data-pkt=pay]", "cm", 1.2, 0.1);
          pulse("market", 1.2);
          travel("[data-pkt=lic]", "ml", 0.9, 1.3);
          pulse("license", 2.2);
          tl.fromTo(q("[data-lic-label]"), { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.3 }, 2.2).to(q("[data-lic-label]"), { autoAlpha: 0, duration: 0.3 }, 3.6);
          travel("[data-pkt=nft]", "nm", 0.8, 1.2);
          travel("[data-pkt=r1]", "mc", 1.3, 2.3);
          travel("[data-pkt=r2]", "mp", 1.1, 2.3);
          travel("[data-pkt=r3]", "mt", 1.3, 2.3);
          pulse("creator", 3.5); pulse("partner", 3.4); pulse("treasury", 3.6);
        },
        () => { gsap.set(qa("[data-pkt]"), { autoAlpha: 0 }); },
      );
    },
    { scope: root },
  );

  return (
    <svg ref={root} viewBox="0 0 540 440" className={className} role="img" aria-label="Animated diagram: a consumer pays in NHUSD, the marketplace mints an ERC-1155 license and splits revenue between creator, compute partner and treasury.">
      <defs>
        <radialGradient id={`${uid}-glow`}><stop offset="0" stopColor="#8b5cf6" stopOpacity=".45" /><stop offset="1" stopColor="#8b5cf6" stopOpacity="0" /></radialGradient>
        {/* userSpaceOnUse: objectBoundingBox gradients render nothing on perfectly horizontal/vertical lines (zero-size bbox) */}
        <linearGradient id={`${uid}-wire`} gradientUnits="userSpaceOnUse" x1="70" y1="0" x2="470" y2="0"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#10b981" /></linearGradient>
      </defs>
      <circle cx={N.market.x} cy={N.market.y} r="150" fill={`url(#${uid}-glow)`} />
      {wires.map((w) => <path key={w.id} id={`${uid}-${w.id}`} data-wire d={d(w.from, w.to)} fill="none" stroke={`url(#${uid}-wire)`} strokeOpacity=".4" strokeWidth="1.5" />)}
      {wires.map((w) => <path key={`${w.id}-flow`} data-flow d={d(w.from, w.to)} fill="none" stroke={`url(#${uid}-wire)`} strokeWidth="1.5" strokeDasharray="6 6" opacity="0" />)}
      {(Object.keys(N) as K[]).map((k) => {
        const n = N[k]; const big = k === "market";
        return (
          <g key={k} transform={`translate(${n.x} ${n.y})`}>
           <g data-node>
            <circle data-ring={k} r={big ? 36 : 26} fill="none" stroke="#a78bfa" strokeWidth="1.5" opacity="0" />
            <circle r={big ? 36 : 26} fill="#11131f" stroke={big ? "#8b5cf6" : "#232740"} strokeWidth={big ? 2 : 1.5} />
            <text y={big ? -2 : -1} textAnchor="middle" className="fill-ink font-display font-semibold" fontSize={big ? 11 : 9}>{n.label}</text>
            <text y={big ? 12 : 11} textAnchor="middle" className="fill-ink-faint font-mono" fontSize="7.5">{n.sub}</text>
           </g>
          </g>
        );
      })}
      <g data-pkt="pay"><circle r="6" fill="#8b5cf6" /><text y="-10" textAnchor="middle" fontSize="8" className="fill-accent-hi font-mono">NHUSD</text></g>
      <g data-pkt="lic"><rect x="-6" y="-6" width="12" height="12" rx="3" fill="#10b981" /></g>
      <g data-pkt="nft"><circle r="4.5" fill="#f59e0b" /></g>
      <g data-pkt="r1"><circle r="5.5" fill="#a78bfa" /></g>
      <g data-pkt="r2"><circle r="4.5" fill="#a78bfa" /></g>
      <g data-pkt="r3"><circle r="3" fill="#a78bfa" /></g>
      <text data-lic-label x={N.license.x + 34} y={N.license.y + 4} fontSize="9" className="fill-ok font-mono" opacity="0">license minted ✓</text>
    </svg>
  );
}
