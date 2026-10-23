import "server-only";
import { cookies } from "next/headers";
import { createPublicKey, verify as edVerify } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import bs58 from "bs58";
import { verifyMessage, type Hex } from "viem";
import type { Family } from "@/lib/auth/siwe";

const SESSION_COOKIE = "nh_session";
const NONCE_COOKIE = "nh_nonce";
const SESSION_TTL_S = 60 * 60 * 12;
const NONCE_TTL_S = 60 * 5;

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.startsWith("change-me")) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set in production");
    return new TextEncoder().encode("dev-only-insecure-secret-do-not-use-in-prod");
  }
  return new TextEncoder().encode(s);
}

const cookieOpts = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

export interface Session { address: string; family: Family }

export async function issueNonce(nonce: string) {
  const jwt = await new SignJWT({ nonce }).setProtectedHeader({ alg: "HS256" }).setExpirationTime(`${NONCE_TTL_S}s`).sign(secret());
  (await cookies()).set(NONCE_COOKIE, jwt, cookieOpts(NONCE_TTL_S));
}

/** Reads and *burns* the nonce so a signed message can never be replayed. */
export async function consumeNonce(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(NONCE_COOKIE)?.value;
  jar.delete(NONCE_COOKIE);
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, secret());
    return typeof payload.nonce === "string" ? payload.nonce : null;
  } catch {
    return null;
  }
}

export async function createSession(s: Session) {
  const jwt = await new SignJWT({ family: s.family })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.address.toLowerCase())
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_S}s`)
    .sign(secret());
  (await cookies()).set(SESSION_COOKIE, jwt, cookieOpts(SESSION_TTL_S));
}

export async function getSession(): Promise<Session | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, secret());
    if (!payload.sub) return null;
    return { address: payload.sub, family: payload.family === "solana" ? "solana" : "evm" };
  } catch {
    return null;
  }
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

// ── signature verification ────────────────────────────────────────────────
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function verifySolanaSignature(address: string, message: string, signatureB58: string): boolean {
  try {
    const pub = bs58.decode(address);
    if (pub.length !== 32) return false;
    const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(pub)]), format: "der", type: "spki" });
    return edVerify(null, Buffer.from(message, "utf8"), key, Buffer.from(bs58.decode(signatureB58)));
  } catch {
    return false;
  }
}

export async function verifyEvmSignature(address: string, message: string, signature: string): Promise<boolean> {
  try {
    return await verifyMessage({ address: address as Hex, message, signature: signature as Hex });
  } catch {
    return false;
  }
}
