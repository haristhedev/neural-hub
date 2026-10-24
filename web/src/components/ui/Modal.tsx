"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { gsap, motion } from "@/lib/motion/gsap";
import { cn } from "@/lib/utils";

/** Accessible modal: focus trap, ESC to close, scroll lock, GSAP enter/exit timeline. */
export function Modal({ open, onClose, title, children, className, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; className?: string; wide?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open || !root.current || !panel.current) return;
    lastFocus.current = document.activeElement as HTMLElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const tl = gsap.timeline();
    const mm = motion(
      () => {
        tl.fromTo(root.current!.querySelector("[data-backdrop]"), { opacity: 0 }, { opacity: 1, duration: 0.25 })
          .fromTo(panel.current!, { y: 28, scale: 0.97, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.45, ease: "expo.out" }, "<0.05")
          .from(panel.current!.querySelectorAll("[data-stagger]"), { y: 12, opacity: 0, stagger: 0.05, duration: 0.35 }, "<0.15");
      },
      () => { gsap.set([root.current, panel.current], { opacity: 1 }); },
    );

    const focusables = () => panel.current!.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])');
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const f = focusables();
        if (!f.length) return;
        const first = f[0]!, last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      tl.kill();
      mm.revert();
      lastFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div ref={root} className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div data-backdrop className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div ref={panel} className={cn("relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-line bg-bg-raised p-6 shadow-2xl sm:rounded-3xl", wide ? "sm:max-w-3xl" : "sm:max-w-md", className)}>
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-ink-dim hover:bg-white/5 hover:text-ink">✕</button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
