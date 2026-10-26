import { describe, expect, it } from "vitest";
import { maxUint256 } from "viem";
import { assessApproval, assessTransfer, hasDanger, isUnlimited } from "@/lib/web3/risk";

const trusted = ["0x1111111111111111111111111111111111111111"] as const;
const stranger = "0x2222222222222222222222222222222222222222" as const;

describe("assessApproval", () => {
  it("is clean for an exact approval to a known contract", () => {
    expect(assessApproval({ amount: 100n, spender: trusted[0], trusted })).toEqual([]);
  });
  it("flags unlimited approvals", () => {
    const f = assessApproval({ amount: maxUint256, spender: trusted[0], trusted });
    expect(f.map((x) => x.code)).toEqual(["unlimited-approval"]);
    expect(isUnlimited(maxUint256)).toBe(true);
  });
  it("flags unknown spenders (case-insensitively trusted otherwise)", () => {
    expect(assessApproval({ amount: 1n, spender: stranger, trusted }).map((x) => x.code)).toContain("unknown-spender");
    expect(assessApproval({ amount: 1n, spender: trusted[0].toUpperCase().replace("0X", "0x") as `0x${string}`, trusted })).toEqual([]);
  });
  it("blocks deny-listed spenders as danger", () => {
    const f = assessApproval({ amount: 1n, spender: "0x000000000000000000000000000000000000dEaD", trusted });
    expect(hasDanger(f)).toBe(true);
  });
});

describe("assessTransfer", () => {
  it("blocks burn addresses", () => {
    expect(hasDanger(assessTransfer({ to: "0x0000000000000000000000000000000000000000" }))).toBe(true);
  });
  it("notes self transfers and large amounts", () => {
    const codes = assessTransfer({ from: stranger, to: stranger, amount: 10n, largeAbove: 5n }).map((x) => x.code);
    expect(codes).toEqual(expect.arrayContaining(["self-transfer", "large-amount"]));
  });
});
