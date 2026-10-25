import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-32 text-center">
      <span className="label-mono">404</span>
      <h1 className="mt-3 font-display text-5xl font-extrabold">Block not found</h1>
      <p className="mt-3 text-ink-dim">That page doesn’t exist on this network.</p>
      <Button className="mt-8" href="/">Back home</Button>
    </div>
  );
}
