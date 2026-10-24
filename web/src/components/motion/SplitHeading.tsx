"use client";
import { useRef, type ElementType, type ReactNode } from "react";
import { gsap, SplitText, useGSAP, motion } from "@/lib/motion/gsap";

/** Headline that reveals word-by-word with SplitText. Text stays selectable/accessible (aria-label + masked lines). */
export function SplitHeading({ children, as: Tag = "h1", className, delay = 0.1 }: { children: string; as?: ElementType; className?: string; delay?: number; extra?: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      motion(() => {
        const split = SplitText.create(el, { type: "lines,words", mask: "lines", autoSplit: true, aria: "auto",
          onSplit: (self) => gsap.from(self.words, { yPercent: 110, opacity: 0, rotate: 4, duration: 0.9, stagger: 0.045, ease: "expo.out", delay }) });
        return () => split.revert();
      });
    },
    { scope: ref },
  );

  return <Tag ref={ref} className={className}>{children}</Tag>;
}
