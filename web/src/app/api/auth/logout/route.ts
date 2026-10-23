import { NextResponse } from "next/server";
import { destroySession } from "@/lib/server/session";
import { safeRoute } from "@/lib/server/http";

export const POST = safeRoute(async () => {
  await destroySession();
  return NextResponse.json({ ok: true });
});
