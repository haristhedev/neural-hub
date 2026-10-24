"use client";
import { useRef } from "react";
import { gsap, useGSAP, motion } from "@/lib/motion/gsap";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/Spinner";
import { explorerTxUrl } from "@/lib/web3/chains";
import { KNOWN_CHAINS } from "@/lib/web3/chains";
import { shortAddress } from "@/lib/web3/format";
import type { StepView, FlowStatus } from "@/features/tx/useTxFlow";
import type { DecodedTxError } from "@/lib/web3/errors";

const PHASE_COPY: Record<StepView["phase"], string> = {
  pending: "Waiting",
  active: "Preparing…",
  signing: "Confirm in your wallet",
  confirming: "Confirming on-chain…",
  done: "Done",
  error: "Failed",
};

/**
 * Visualises a multi-step wallet flow (permit → purchase, approve → deposit…).
 * GSAP drives: the progress rail filling, the success tick drawing itself (DrawSVG),
 * a shake on failure, and a pulse while the wallet is waiting for the user.
 */
export function TxStepper({ steps, status, error, chainId }: { steps: StepView[]; status: FlowStatus; error?: DecodedTxError; chainId: number }) {
  const root = useRef<HTMLDivElement>(null);
  const sig = steps.map((s) => s.phase).join("|");

  useGSAP(
    () => {
      const el = root.current;
      if (!el || !steps.length) return;
      motion(() => {
        const done = steps.filter((s) => s.phase === "done").length;
        gsap.to(el.querySelector("[data-rail-fill]"), { scaleY: steps.length > 1 ? done / (steps.length - 1) : done ? 1 : 0, duration: 0.6, ease: "power2.inOut", transformOrigin: "top" });
        el.querySelectorAll<SVGPathElement>("[data-tick]").forEach((p) => {
          if (!p.dataset.drawn) { p.dataset.drawn = "1"; gsap.fromTo(p, { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.45, ease: "power2.out" }); }
        });
        const signing = el.querySelector("[data-signing]");
        if (signing) gsap.fromTo(signing, { boxShadow: "0 0 0 0 rgba(139,92,246,.6)" }, { boxShadow: "0 0 0 10px rgba(139,92,246,0)", duration: 1.2, repeat: -1, ease: "power1.out" });
        const failed = el.querySelector("[data-failed]");
        if (failed) gsap.fromTo(failed, { x: -6 }, { x: 0, duration: 0.5, ease: "elastic.out(1,0.3)" });
      }, () => { gsap.set(el.querySelector("[data-rail-fill]"), { scaleY: 1 }); });
    },
    { scope: root, dependencies: [sig] },
  );

  if (!steps.length) return null;
  const chain = KNOWN_CHAINS[chainId];

  return (
    <div ref={root} className="rounded-xl border border-line bg-bg/60 p-4" aria-live="polite">
      <ol className="relative space-y-4">
        <span className="absolute bottom-3 left-[13px] top-3 w-px bg-line" aria-hidden />
        <span data-rail-fill className="absolute bottom-3 left-[13px] top-3 w-px origin-top scale-y-0 bg-accent" aria-hidden />
        {steps.map((s, i) => {
          const link = s.hash ? explorerTxUrl(chain, s.hash) : undefined;
          return (
            <li key={s.id} className="relative flex items-start gap-3">
              <span
                {...(s.phase === "signing" ? { "data-signing": "" } : {})} {...(s.phase === "error" ? { "data-failed": "" } : {})}
                className={cn("z-10 grid h-[27px] w-[27px] shrink-0 place-items-center rounded-full border text-[11px] font-mono transition-colors",
                  s.phase === "done" && "border-ok bg-ok/15 text-ok", s.phase === "error" && "border-bad bg-bad/15 text-bad",
                  (s.phase === "active" || s.phase === "confirming" || s.phase === "signing") && "border-accent bg-accent-lo text-accent-hi",
                  s.phase === "pending" && "border-line bg-bg text-ink-faint")}
              >
                {s.phase === "done" ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path data-tick d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                ) : s.phase === "error" ? "✕" : s.phase === "pending" ? i + 1 : <Spinner size={13} />}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className={cn("text-sm font-medium", s.phase === "pending" && "text-ink-dim")}>{s.label}</div>
                <div className="font-mono text-[11px] text-ink-faint">
                  {PHASE_COPY[s.phase]}
                  {s.hash && (link ? <> · <a className="text-accent-hi hover:underline" href={link} target="_blank" rel="noopener noreferrer">{shortAddress(s.hash, 8, 6)} ↗</a></> : <> · <span className="num">{shortAddress(s.hash, 8, 6)}</span></>)}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {status === "error" && error && (
        <div role="alert" className={cn("mt-4 rounded-lg border p-3 text-sm", error.kind === "rejected" ? "border-warn/30 bg-warn/10 text-warn" : "border-bad/30 bg-bad/10 text-bad")}>
          <div className="font-medium">{error.title}</div>
          <div className="mt-0.5 text-xs opacity-90">{error.message}</div>
        </div>
      )}
      {status === "success" && <div className="mt-4 rounded-lg border border-ok/30 bg-ok/10 p-3 text-sm text-ok">Confirmed on-chain ✓</div>}
    </div>
  );
}
