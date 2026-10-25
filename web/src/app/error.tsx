"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div role="alert" className="mx-auto max-w-xl px-4 py-32 text-center">
      <span className="label-mono text-bad">Something broke</span>
      <h1 className="mt-3 font-display text-4xl font-extrabold">Unexpected error</h1>
      <p className="mt-3 text-ink-dim">The page crashed while rendering. Your funds are safe — no transaction is sent without a wallet confirmation.</p>
      <Button className="mt-8" onClick={reset}>Try again</Button>
    </div>
  );
}
