"use client";
import { useRef } from "react";
import { gsap, useGSAP, motion } from "@/lib/motion/gsap";

interface Props {
  value: number;
  format?: (n: number) => string;
  className?: string;
  duration?: number;
}

/** Tweens a number into view (and between updates when live data changes). Falls back to the final value. */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString("en-US"), className, duration = 1.4 }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef({ v: 0 });
  const first = useRef(true);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const write = () => { el.textContent = format(shown.current.v); };
      motion(
        () => {
          gsap.to(shown.current, {
            v: value,
            duration: first.current ? duration : 0.8,
            ease: "power2.out",
            onUpdate: write,
            ...(first.current ? { scrollTrigger: { trigger: el, start: "top 95%", once: true } } : {}),
          });
          first.current = false;
        },
        () => { shown.current.v = value; write(); },
      );
    },
    { dependencies: [value], scope: ref },
  );

  return <span ref={ref} className={className}>{format(0)}</span>;
}
