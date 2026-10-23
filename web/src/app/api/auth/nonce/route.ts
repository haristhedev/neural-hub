import { NextResponse } from "next/server";
import { randomNonce } from "@/lib/auth/siwe";
import { issueNonce } from "@/lib/server/session";
import { safeRoute } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = safeRoute(async () => {
  const nonce = randomNonce();
  await issueNonce(nonce);
  return NextResponse.json({ nonce }, { headers: { "Cache-Control": "no-store" } });
});
