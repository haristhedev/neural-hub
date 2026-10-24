import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="label-mono block">{label}</label>
      {children}
      {error ? <p role="alert" className="text-xs text-bad">{error}</p> : hint ? <p className="text-xs text-ink-faint">{hint}</p> : null}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-line bg-bg-raised px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-accent focus:outline-none aria-[invalid=true]:border-bad";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { mono?: boolean; suffix?: ReactNode }>(function Input({ className, mono, suffix, ...rest }, ref) {
  return (
    <div className="relative">
      <input ref={ref} className={cn(inputCls, mono && "font-mono", suffix ? "pr-20" : "", className)} {...rest} />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-ink-faint">{suffix}</span>}
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(inputCls, "min-h-28 resize-y", className)} {...rest} />;
});

export function Toggle({ checked, onChange, labels }: { checked: boolean; onChange: (v: boolean) => void; labels?: [string, string] }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      aria-label={labels ? `${labels[0]} / ${labels[1]}` : "toggle"}
      className={cn("relative h-6 w-11 rounded-full border border-line transition-colors", checked ? "bg-accent" : "bg-bg-raised")}
    >
      <span className={cn("absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white transition-all duration-200", checked ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}
