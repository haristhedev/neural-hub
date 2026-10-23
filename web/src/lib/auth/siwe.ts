/**
 * Sign-in-with-wallet messages (EIP-4361 for EVM, the equivalent SIWS layout for Solana).
 * Pure functions shared by the browser (build + sign) and the server (parse + verify).
 */
export type Family = "evm" | "solana";

export interface SignInFields {
  family: Family;
  domain: string;
  address: string;
  statement: string;
  uri: string;
  chainId?: number; // evm only
  nonce: string;
  issuedAt: string; // ISO 8601
}

export const SIGN_IN_STATEMENT = "Sign in to NeuralHub. This request does not trigger a transaction or cost gas.";

export function buildSignInMessage(f: SignInFields): string {
  const account = f.family === "evm" ? "Ethereum" : "Solana";
  const lines = [
    `${f.domain} wants you to sign in with your ${account} account:`,
    f.address,
    "",
    f.statement,
    "",
    `URI: ${f.uri}`,
    "Version: 1",
  ];
  if (f.family === "evm" && f.chainId !== undefined) lines.push(`Chain ID: ${f.chainId}`);
  lines.push(`Nonce: ${f.nonce}`, `Issued At: ${f.issuedAt}`);
  return lines.join("\n");
}

export function parseSignInMessage(message: string): SignInFields | null {
  const m =
    /^(?<domain>[^\s]+) wants you to sign in with your (?<account>Ethereum|Solana) account:\n(?<address>[^\n]+)\n\n(?<statement>[^\n]*)\n\nURI: (?<uri>[^\n]+)\nVersion: 1\n(?:Chain ID: (?<chainId>\d+)\n)?Nonce: (?<nonce>[A-Za-z0-9]{8,64})\nIssued At: (?<issuedAt>[^\n]+)$/.exec(
      message,
    );
  const g = m?.groups;
  if (!g) return null;
  return {
    family: g.account === "Ethereum" ? "evm" : "solana",
    domain: g.domain!,
    address: g.address!,
    statement: g.statement!,
    uri: g.uri!,
    chainId: g.chainId ? Number(g.chainId) : undefined,
    nonce: g.nonce!,
    issuedAt: g.issuedAt!,
  };
}

export const randomNonce = (bytes = 16) => {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
};
