"use client";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Flip } from "gsap/Flip";
import { SplitText } from "gsap/SplitText";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { useGSAP } from "@gsap/react";

/**
 * One place that registers every GSAP plugin and sets house defaults, so components just import from here.
 * All animation code in the app goes through `motion()` (below), which wraps gsap.matchMedia so that
 * users with `prefers-reduced-motion` get the final state instantly instead of the animation.
 */
if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP, ScrollTrigger, Flip, SplitText, DrawSVGPlugin, MotionPathPlugin);
  gsap.defaults({ ease: "power3.out", duration: 0.7 });
  ScrollTrigger.config({ ignoreMobileResize: true });
  document.documentElement.dataset.gsap = "ready"; // lets the CSS failsafe know motion is alive
}

export { gsap, ScrollTrigger, Flip, SplitText, useGSAP };

export const EASE = {
  out: "power3.out",
  inOut: "power2.inOut",
  spring: "back.out(1.6)",
  snap: "expo.out",
} as const;

/**
 * Run `fn` only when motion is allowed; run `reduced` (optional) otherwise.
 * Must be called inside a useGSAP/gsap.context so everything is reverted on unmount.
 */
export function motion(fn: () => void | (() => void), reduced?: () => void) {
  const mm = gsap.matchMedia();
  mm.add("(prefers-reduced-motion: no-preference)", () => fn());
  if (reduced) mm.add("(prefers-reduced-motion: reduce)", () => reduced());
  return mm;
}
