"use client";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Magnetic } from "@/components/motion/Magnetic";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-mono font-medium uppercase tracking-[0.06em] transition-[background,border-color,color,opacity,transform] duration-200 disabled:cursor-not-allowed disabled:opacity-45 active:scale-[0.98] select-none whitespace-nowrap";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-[#9b72ff] shadow-[0_0_0_1px_rgba(255,255,255,.08)_inset,0_8px_30px_-8px_rgba(139,92,246,.6)]",
  secondary: "border border-line bg-bg-raised text-ink hover:border-accent/60 hover:bg-surface",
  ghost: "text-ink-dim hover:text-ink hover:bg-white/5",
  danger: "border border-bad/40 bg-bad/10 text-bad hover:bg-bad/20",
};
const sizes: Record<Size, string> = { sm: "h-8 px-3 text-[11px]", md: "h-10 px-4 text-xs", lg: "h-12 px-6 text-[13px]" };

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  magnetic?: boolean;
  icon?: ReactNode;
  href?: string;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", loading, magnetic, icon, href, className, children, disabled, ...rest },
  ref,
) {
  const cls = cn(base, variants[variant], sizes[size], className);
  const content = (
    <>
      {loading ? <Spinner size={14} /> : icon}
      {children}
    </>
  );
  const el = href ? (
    <Link href={href} className={cls}>{content}</Link>
  ) : (
    <button ref={ref} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>{content}</button>
  );
  return magnetic ? <Magnetic>{el}</Magnetic> : el;
});
