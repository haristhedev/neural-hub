import { z } from "zod";
import { isAddress, parseUnits } from "viem";

export const addressSchema = z.string().refine((v) => isAddress(v), "Enter a valid 0x address");

/** Luhn checksum — catches typos in card numbers before anything leaves the form. */
export function luhn(num: string): boolean {
  const d = num.replace(/\D/g, "");
  if (d.length < 12 || d.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}

export const cardSchema = z.object({
  name: z.string().trim().min(2, "Name on card is required").max(60),
  number: z.string().refine(luhn, "Card number looks invalid"),
  exp: z.string().regex(/^(0[1-9]|1[0-2])\s*\/\s*\d{2}$/, "Use MM / YY").refine((v) => {
    const [mm, yy] = v.split("/").map((x) => Number(x.trim()));
    const end = new Date(2000 + yy!, mm!, 1); // first day of the month after expiry
    return end.getTime() > Date.now();
  }, "Card has expired"),
  cvc: z.string().regex(/^\d{3,4}$/, "3–4 digits"),
});

/** Decimal-string → base units, or an error string. Never use parseFloat for token amounts. */
export function parseAmount(input: string, decimals: number, opts: { max?: bigint; allowZero?: boolean } = {}): { value?: bigint; error?: string } {
  const t = input.trim();
  if (!t) return { error: "Enter an amount" };
  if (!/^\d*\.?\d*$/.test(t) || t === ".") return { error: "Numbers only" };
  const [, frac = ""] = t.split(".");
  if (frac.length > decimals) return { error: `Max ${decimals} decimal places` };
  const value = parseUnits(t, decimals);
  if (value === 0n && !opts.allowZero) return { error: "Amount must be greater than zero" };
  if (opts.max !== undefined && value > opts.max) return { error: "Exceeds your balance" };
  return { value };
}

export const gatewayRequestSchema = z.object({
  chainId: z.number().int().positive(),
  modelId: z.number().int().positive(),
  calls: z.number().int().min(1).max(1_000),
  prompt: z.string().max(500).optional(),
});
