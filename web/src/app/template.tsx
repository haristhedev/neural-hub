"use client";
import { useRef } from "react";
import { gsap, useGSAP, motion } from "@/lib/motion/gsap";

/** Re-mounts on every navigation → a short, GPU-cheap route-enter transition. */
let isFirstRender = true; // SSR HTML is already visible — only animate later (client-side) navigations

export default function Template({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => { if (isFirstRender) { isFirstRender = false; return; } motion(() => { gsap.fromTo(ref.current, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.55, ease: "power3.out", clearProps: "transform" }); }); }, { scope: ref });
  return <div ref={ref}>{children}</div>;
}
