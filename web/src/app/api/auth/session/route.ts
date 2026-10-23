import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { safeRoute } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = safeRoute(async () => NextResponse.json({ session: await getSession() }, { headers: { "Cache-Control": "no-store" } }));
