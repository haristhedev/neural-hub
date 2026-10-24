import Link from "next/link";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line-soft">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5 font-display text-lg font-bold"><Logo size={28} /> NeuralHub</div>
          <p className="mt-3 max-w-xs text-sm text-ink-dim">Decentralized models, ownership contracts, and verifiable pay-per-use inference.</p>
        </div>
        {[
          ["Marketplace", [["Explore", "/explore"], ["Pricing", "/pricing"], ["My assets", "/assets"]]],
          ["Build", [["Creator dashboard", "/dashboard"], ["API console", "/console"]]],
          ["Protocol", [["ERC-20 · NHUSD", "/assets"], ["ERC-721 · Models", "/assets"], ["ERC-1155 · Licenses", "/assets"]]],
        ].map(([title, links]) => (
          <div key={title as string}>
            <div className="label-mono">{title as string}</div>
            <ul className="mt-3 space-y-2 text-sm text-ink-dim">
              {(links as string[][]).map(([l, h]) => <li key={l}><Link className="hover:text-ink" href={h!}>{l}</Link></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line-soft py-5 text-center font-mono text-[11px] text-ink-faint">Test-network software · no real funds · built for Web3</div>
    </footer>
  );
}
