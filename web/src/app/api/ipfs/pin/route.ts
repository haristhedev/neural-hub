import { NextResponse, type NextRequest } from "next/server";
import { safeRoute } from "@/lib/server/http";
import { modelMetadataSchema } from "@/lib/web3/ipfs";
import { getSession } from "@/lib/server/session";
import { rateLimit } from "@/lib/server/rateLimit";

/**
 * Pins model metadata. With PINATA_JWT set it returns `ipfs://<cid>`; otherwise it falls back to an
 * on-chain-friendly `data:` URI so the demo works with zero infrastructure. Validated + size-capped + authenticated.
 */
export const POST = safeRoute(async (req: NextRequest) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!rateLimit(`pin:${session.address}`, { limit: 5, windowMs: 60_000 }).ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const text = await req.text();
  if (text.length > 64_000) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  let json: unknown = null;
  try { json = JSON.parse(text || "null"); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const parsed = modelMetadataSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid metadata", issues: parsed.error.flatten() }, { status: 400 });

  const jwt = process.env.PINATA_JWT;
  if (jwt) {
    const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ pinataContent: parsed.data }),
    });
    if (!res.ok) return NextResponse.json({ error: "pin_failed" }, { status: 502 });
    const { IpfsHash } = (await res.json()) as { IpfsHash: string };
    return NextResponse.json({ uri: `ipfs://${IpfsHash}`, pinned: true });
  }
  const uri = `data:application/json;base64,${Buffer.from(JSON.stringify(parsed.data)).toString("base64")}`;
  return NextResponse.json({ uri, pinned: false });
});
