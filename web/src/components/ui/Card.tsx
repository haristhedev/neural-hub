import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, highlight, ...rest }: HTMLAttributes<HTMLDivElement> & { highlight?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-surface/90 backdrop-blur-sm transition-colors",
        highlight ? "border-accent/70 shadow-[0_0_0_1px_rgba(139,92,246,.2),0_20px_60px_-30px_rgba(139,92,246,.5)]" : "border-line",
        className,
      )}
      {...rest}
    />
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-mono text-[11px] uppercase tracking-[0.14em] text-accent-hi", className)}>{children}</span>;
}

export function Badge({ children, tone = "accent", className }: { children: React.ReactNode; tone?: "accent" | "ok" | "warn" | "bad" | "mute"; className?: string }) {
  const tones = {
    accent: "bg-accent-lo text-accent-hi",
    ok: "bg-ok/10 text-ok border border-ok/30",
    warn: "bg-warn/10 text-warn border border-warn/30",
    bad: "bg-bad/10 text-bad border border-bad/30",
    mute: "bg-white/5 text-ink-dim",
  };
  return <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider", tones[tone], className)}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-white/5", className)} aria-hidden />;
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "ok" | "accent" | "warn" }) {
  const toneCls = tone === "ok" ? "text-ok" : tone === "accent" ? "text-accent-hi" : tone === "warn" ? "text-warn" : "text-ink-faint";
  return (
    <Card className="p-5">
      <div className="label-mono">{label}</div>
      <div className="mt-3 font-display text-3xl font-bold tracking-tight">{value}</div>
      {sub && <div className={cn("mt-1 font-mono text-xs", toneCls)}>{sub}</div>}
    </Card>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <div className="font-display text-lg font-semibold">{title}</div>
      {body && <p className="mt-1 max-w-md text-sm text-ink-dim">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
