import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { parseSignInMessage } from "@/lib/auth/siwe";
import { consumeNonce, createSession, verifyEvmSignature, verifySolanaSignature } from "@/lib/server/session";
import { rateLimit } from "@/lib/server/rateLimit";
import { safeRoute } from "@/lib/server/http";

const body = z.object({ message: z.string().max(1_000), signature: z.string().max(400) });
const MAX_AGE_MS = 5 * 60_000;

const fail = (error: string, status = 401) => NextResponse.json({ error }, { status });

export const POST = safeRoute(async (req: NextRequest) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!rateLimit(`verify:${ip}`, { limit: 10, windowMs: 60_000 }).ok) return fail("Too many attempts", 429);

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Malformed request", 400);
  const { message, signature } = parsed.data;

  const fields = parseSignInMessage(message);
  if (!fields) return fail("Unrecognised sign-in message", 400);

  // 1) domain binding — a message signed for another site must not log in here (phishing protection)
  const host = req.headers.get("host");
  if (!host || fields.domain !== host) return fail("Domain mismatch");
  // 2) single-use nonce (burned on read)
  const nonce = await consumeNonce();
  if (!nonce || nonce !== fields.nonce) return fail("Invalid or expired nonce");
  // 3) freshness
  const age = Date.now() - Date.parse(fields.issuedAt);
  if (!Number.isFinite(age) || age < -30_000 || age > MAX_AGE_MS) return fail("Message expired");
  // 4) signature
  const ok =
    fields.family === "evm"
      ? await verifyEvmSignature(fields.address, message, signature)
      : verifySolanaSignature(fields.address, message, signature);
  if (!ok) return fail("Signature verification failed");

  await createSession({ address: fields.address, family: fields.family });
  return NextResponse.json({ address: fields.address.toLowerCase(), family: fields.family });
});
