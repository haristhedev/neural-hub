"use client";
import { useRef, type ElementType, type ReactNode } from "react";
import { gsap, ScrollTrigger, useGSAP, motion } from "@/lib/motion/gsap";

interface RevealProps {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  delay?: number;
  y?: number;
  /** when set, direct children (`[data-reveal-item]`) are staggered instead of the wrapper */
  stagger?: number;
}

/** Scroll-triggered entrance. Uses data-reveal so the CSS pre-hide (no-flash) in globals.css applies. */
export function Reveal({ children, as: Tag = "div", className, delay = 0, y = 22, stagger }: RevealProps) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      motion(
        () => {
          if (!stagger) {
            gsap.fromTo(
              el,
              { autoAlpha: 0, y },
              {
                autoAlpha: 1, y: 0, delay, duration: 0.8,
                scrollTrigger: { trigger: el, start: "top 88%", once: true },
                onComplete: () => { gsap.set(el, { clearProps: "transform" }); },
              },
            );
            ScrollTrigger.refresh();
            return;
          }

          // Staggered children can arrive after mount (async chain data), so targets are discovered lazily:
          // hide each new [data-reveal-item] the moment it appears, reveal them together once the section is in view.
          const seen = new WeakSet<Element>();
          const pending = new Set<Element>();
          let inView = false;
          const collect = () => Array.from(el.querySelectorAll("[data-reveal-item]")).filter((n) => !seen.has(n));
          const hide = (nodes: Element[]) => { if (!nodes.length) return; nodes.forEach((n) => { seen.add(n); pending.add(n); }); gsap.set(nodes, { autoAlpha: 0, y }); };
          const flush = () => {
            const items = [...pending];
            pending.clear();
            if (items.length) gsap.to(items, { autoAlpha: 1, y: 0, delay, stagger, duration: 0.8, ease: "power3.out", clearProps: "transform" });
          };

          hide(collect());
          const mo = new MutationObserver(() => { const fresh = collect(); if (!fresh.length) return; hide(fresh); if (inView) flush(); });
          mo.observe(el, { childList: true, subtree: true });
          ScrollTrigger.create({ trigger: el, start: "top 88%", once: true, onEnter: () => { inView = true; flush(); } });
          ScrollTrigger.refresh();
          return () => mo.disconnect();
        },
        () => { gsap.set(stagger ? el.querySelectorAll("[data-reveal-item]") : el, { autoAlpha: 1, y: 0 }); },
      );
    },
    { scope: ref },
  );

  return (
    <Tag ref={ref} data-reveal={stagger ? undefined : ""} className={className}>
      {children}
    </Tag>
  );
}

/** Marks a child of <Reveal stagger> */
export const revealItem = { "data-reveal-item": "" } as const;
