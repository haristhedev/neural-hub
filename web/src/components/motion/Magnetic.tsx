"use client";
import { useRef, type ReactNode } from "react";
import { gsap, useGSAP } from "@/lib/motion/gsap";

/** Subtle cursor-follow for primary CTAs. Pointer-fine devices only; disabled under reduced motion. */
export function Magnetic({ children, strength = 0.28, className }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference) and (pointer: fine)", () => {
        const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3.out" });
        const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" });
        const move = (e: MouseEvent) => {
          const r = el.getBoundingClientRect();
          xTo((e.clientX - (r.left + r.width / 2)) * strength);
          yTo((e.clientY - (r.top + r.height / 2)) * strength);
        };
        const leave = () => { xTo(0); yTo(0); };
        el.addEventListener("mousemove", move);
        el.addEventListener("mouseleave", leave);
        return () => { el.removeEventListener("mousemove", move); el.removeEventListener("mouseleave", leave); };
      });
    },
    { scope: ref },
  );

  return <span ref={ref} className={className} style={{ display: "inline-block" }}>{children}</span>;
}
