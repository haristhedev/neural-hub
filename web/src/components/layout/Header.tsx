"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "./Logo";
import { WalletButton } from "@/components/wallet/WalletButton";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/explore", label: "Explore Models" },
  { href: "/console", label: "API Console" },
  { href: "/dashboard", label: "Creator Dashboard" },
  { href: "/assets", label: "My Assets" },
  { href: "/pricing", label: "Pricing" },
];

export function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-line-soft bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight" aria-label="NeuralHub home">
          <Logo /> NeuralHub
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path.startsWith(n.href) ? "page" : undefined}
              className={cn("rounded-lg px-3 py-2 text-sm transition-colors", path.startsWith(n.href) ? "text-ink" : "text-ink-dim hover:text-ink")}>
              {n.label}
              {path.startsWith(n.href) && <span className="mx-auto mt-0.5 block h-0.5 w-4 rounded bg-accent" />}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <WalletButton />
          <button className="grid h-10 w-10 place-items-center rounded-lg border border-line lg:hidden" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <span className="block h-0.5 w-4 bg-ink shadow-[0_5px_0_var(--color-ink),0_-5px_0_var(--color-ink)]" />
          </button>
        </div>
      </div>
      {open && (
        <nav aria-label="Mobile" className="border-t border-line-soft px-4 py-3 lg:hidden">
          {NAV.map((n) => <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm text-ink-dim hover:bg-white/5 hover:text-ink">{n.label}</Link>)}
        </nav>
      )}
    </header>
  );
}
