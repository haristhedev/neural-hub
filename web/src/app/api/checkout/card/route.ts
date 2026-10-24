import { NextResponse, type NextRequest } from "next/server";
import { safeRoute } from "@/lib/server/http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { cardSchema } from "@/lib/validation";

/**
 * SIMULATED card processor (test mode). It validates the payload and returns a fake receipt — no charge is made
 * and nothing is stored or logged. In production the browser would use Stripe Elements/Payment Element so raw
 * card data never touches our servers at all; this route stands in for the PSP webhook flow.
 */
const body = z.object({ amountUsd: z.number().positive().max(100_000), description: z.string().max(120), card: cardSchema });

export const POST = safeRoute(async (req: NextRequest) => {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_card", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  await new Promise((r) => setTimeout(r, 700));
  if (parsed.data.card.number.replace(/\D/g, "").endsWith("0002")) return NextResponse.json({ error: "card_declined", message: "Your card was declined (test card …0002)." }, { status: 402 });
  return NextResponse.json({ status: "succeeded", simulated: true, receiptId: `rcpt_${randomUUID().slice(0, 8)}`, amountUsd: parsed.data.amountUsd });
});
