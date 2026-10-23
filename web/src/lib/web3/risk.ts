import type { Address } from "viem";

export type RiskLevel = "info" | "warn" | "danger";
export interface RiskFlag {
  level: RiskLevel;
  code: "unlimited-approval" | "unknown-spender" | "unknown-contract" | "blocklisted" | "self-transfer" | "zero-address" | "large-amount";
  message: string;
}

const MAX_SAFE = 2n ** 255n;
export const isUnlimited = (amount: bigint) => amount >= MAX_SAFE;

/**
 * Static deny-list. In production this is fed from a signed remote list (e.g. a wallet-security feed);
 * the shape is kept so the check below is a pure function that is trivial to unit-test.
 */
export const BLOCKLIST: ReadonlySet<string> = new Set<string>([
  "0x0000000000000000000000000000000000000000".toLowerCase(),
  "0x000000000000000000000000000000000000dead".toLowerCase(),
]);

export interface ApprovalCheck {
  amount: bigint;
  spender: Address;
  trusted: readonly Address[];
}

export function assessApproval({ amount, spender, trusted }: ApprovalCheck): RiskFlag[] {
  const flags: RiskFlag[] = [];
  if (BLOCKLIST.has(spender.toLowerCase())) {
    flags.push({ level: "danger", code: "blocklisted", message: "This address is on the security deny-list." });
  }
  if (!trusted.some((t) => t.toLowerCase() === spender.toLowerCase())) {
    flags.push({ level: "warn", code: "unknown-spender", message: "Spender is not a NeuralHub contract on this network." });
  }
  if (isUnlimited(amount)) {
    flags.push({ level: "warn", code: "unlimited-approval", message: "Unlimited approval: this spender can move all of your tokens until you revoke it." });
  }
  return flags;
}

export interface TransferCheck {
  from?: Address;
  to: Address;
  amount?: bigint;
  /** balance threshold above which we nudge for double-checking */
  largeAbove?: bigint;
}

export function assessTransfer({ from, to, amount, largeAbove }: TransferCheck): RiskFlag[] {
  const flags: RiskFlag[] = [];
  if (BLOCKLIST.has(to.toLowerCase())) {
    flags.push({ level: "danger", code: /^0x0+$/.test(to) ? "zero-address" : "blocklisted", message: "Recipient is a burn / deny-listed address — funds would be lost." });
  }
  if (from && from.toLowerCase() === to.toLowerCase()) {
    flags.push({ level: "info", code: "self-transfer", message: "You are sending to your own address." });
  }
  if (amount !== undefined && largeAbove !== undefined && amount >= largeAbove) {
    flags.push({ level: "warn", code: "large-amount", message: "This is a large amount — double-check the recipient." });
  }
  return flags;
}

export const hasDanger = (flags: RiskFlag[]) => flags.some((f) => f.level === "danger");
