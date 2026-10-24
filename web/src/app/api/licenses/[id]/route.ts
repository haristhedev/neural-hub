import { NextResponse, type NextRequest } from "next/server";
import { safeRoute } from "@/lib/server/http";
import { TIERS } from "@/lib/web3/contracts";

/** ERC-1155 metadata endpoint for `uri(id)` — id arrives as 64 lowercase hex chars per the standard. */
export const GET = safeRoute(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id: raw } = await params;
  const hex = raw.replace(/\.json$/, "");
  if (!/^[0-9a-f]{1,64}$/.test(hex)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const id = BigInt(`0x${hex}`);
  const modelId = id >> 8n;
  const tier = TIERS.find((t) => t.id === Number(id & 0xffn));
  if (!tier) return NextResponse.json({ error: "unknown tier" }, { status: 404 });

  const title = modelId === 0n ? `NeuralHub ${tier.id === 1 ? "Pro" : tier.id === 2 ? "Team" : "Enterprise"} Plan Pass` : `${tier.label} License · Model #${modelId}`;
  return NextResponse.json(
    {
      name: title,
      description: modelId === 0n ? "Platform subscription pass." : `${tier.blurb}. Verifiable on-chain license for NeuralHub model #${modelId}.`,
      attributes: [
        { trait_type: "Model", value: modelId.toString() },
        { trait_type: "Tier", value: tier.label },
        { trait_type: "Perpetual", value: tier.perpetual ? "Yes" : "No" },
      ],
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
});
