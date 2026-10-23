import { parseSignature, type Address, type Hex, type PublicClient } from "viem";
import type { Contracts } from "@/lib/web3/contracts";

export interface PermitSignature { deadline: bigint; v: number; r: Hex; s: Hex }

const PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/**
 * Builds the EIP-712 payload for an EIP-2612 permit. The domain comes from the token's own
 * `eip712Domain()` (EIP-5267), so the UI never hard-codes name/version/chain and cannot sign for the wrong contract.
 */
export async function buildPermitTypedData(opts: { client: PublicClient; c: Contracts; owner: Address; spender: Address; value: bigint; ttlSeconds?: number }) {
  const { client, c, owner, spender, value, ttlSeconds = 1_800 } = opts;
  const [domain, nonce] = await Promise.all([
    client.readContract({ ...c.paymentToken, functionName: "eip712Domain" }),
    client.readContract({ ...c.paymentToken, functionName: "nonces", args: [owner] }),
  ]);
  const [, name, version, chainId, verifyingContract] = domain;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + ttlSeconds);
  return {
    deadline,
    typed: {
      domain: { name, version, chainId: Number(chainId), verifyingContract },
      types: PERMIT_TYPES,
      primaryType: "Permit" as const,
      message: { owner, spender, value, nonce, deadline },
    },
  };
}

export function splitSignature(sig: Hex, deadline: bigint): PermitSignature {
  const { r, s, v, yParity } = parseSignature(sig);
  return { deadline, v: Number(v ?? BigInt(yParity + 27)), r, s };
}
