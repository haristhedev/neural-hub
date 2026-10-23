import { formatUnits, getAddress, isAddress } from "viem";
import { PAYMENT_DECIMALS } from "./contracts";

export const shortAddress = (a?: string, head = 6, tail = 4) =>
  !a ? "" : a.length <= head + tail + 2 ? a : `${a.slice(0, head)}…${a.slice(-tail)}`;

export const checksum = (a: string) => (isAddress(a) ? getAddress(a) : a);

/** Format a payment-token base-unit amount as `$1,234.56` (trims noise for tiny per-call prices). */
export function formatUsd(value: bigint | undefined, opts: { maxFraction?: number } = {}): string {
  if (value === undefined) return "—";
  const n = Number(formatUnits(value, PAYMENT_DECIMALS));
  const small = Math.abs(n) > 0 && Math.abs(n) < 0.01;
  const max = small ? 4 : (opts.maxFraction ?? 2);
  // Intl throws a RangeError when min > max, so clamp (e.g. `maxFraction: 0` for whole-dollar prices).
  const min = Math.min(small ? 3 : 2, max);
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: min, maximumFractionDigits: max });
}

export const usdNumber = (v: bigint) => Number(formatUnits(v, PAYMENT_DECIMALS));

export function compact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function timeAgo(tsSeconds: number | bigint, now = Date.now()): string {
  const diff = Math.max(0, Math.floor(now / 1000 - Number(tsSeconds)));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 60) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(Number(tsSeconds) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const formatDate = (tsSeconds: number | bigint) =>
  new Date(Number(tsSeconds) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export const bpsToPct = (bps: number | bigint) => `${(Number(bps) / 100).toFixed(Number(bps) % 100 === 0 ? 0 : 1)}%`;
