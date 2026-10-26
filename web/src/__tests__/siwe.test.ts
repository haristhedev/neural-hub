import { describe, expect, it } from "vitest";
import { buildSignInMessage, parseSignInMessage, randomNonce, SIGN_IN_STATEMENT, type SignInFields } from "@/lib/auth/siwe";

const base: SignInFields = { family: "evm", domain: "localhost:3000", address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", statement: SIGN_IN_STATEMENT, uri: "http://localhost:3000", chainId: 31337, nonce: "abcdef0123456789", issuedAt: "2026-06-15T12:00:00.000Z" };

describe("sign-in message", () => {
  it("round-trips for EVM", () => {
    expect(parseSignInMessage(buildSignInMessage(base))).toEqual(base);
  });
  it("round-trips for Solana (no chain id)", () => {
    const sol = { ...base, family: "solana" as const, chainId: undefined, address: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin" };
    expect(parseSignInMessage(buildSignInMessage(sol))).toEqual(sol);
  });
  it("rejects tampered or injected messages", () => {
    expect(parseSignInMessage(buildSignInMessage(base) + "\nExtra: 1")).toBeNull();
    expect(parseSignInMessage("hello")).toBeNull();
    expect(parseSignInMessage(buildSignInMessage({ ...base, nonce: "short" }))).toBeNull();
  });
  it("generates unpredictable nonces", () => {
    const a = randomNonce(); const b = randomNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });
});
