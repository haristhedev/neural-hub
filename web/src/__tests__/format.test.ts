import { describe, expect, it } from "vitest";
import { bpsToPct, compact, formatUsd, shortAddress, timeAgo, usdNumber } from "@/lib/web3/format";
import { cardSchema, gatewayRequestSchema, luhn, parseAmount } from "@/lib/validation";

describe("format", () => {
  it("formats 6-decimal stablecoin amounts", () => {
    expect(formatUsd(1_234_560_000n)).toBe("$1,234.56");
    expect(formatUsd(20_000n)).toBe("$0.02");
    expect(formatUsd(2_500n)).toBe("$0.0025");
    expect(formatUsd(undefined)).toBe("—");
    // regression: maxFraction below the default minimum used to throw a RangeError and crash /pricing
    expect(formatUsd(29_000_000n, { maxFraction: 0 })).toBe("$29");
    expect(formatUsd(1_234_500_000n, { maxFraction: 0 })).toBe("$1,235");
    expect(usdNumber(2_500_000n)).toBe(2.5);
  });
  it("shortens addresses, bps and big numbers", () => {
    expect(shortAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234…5678");
    expect(bpsToPct(1000)).toBe("10%");
    expect(bpsToPct(250)).toBe("2.5%");
    expect(compact(12_500)).toBe("12.5K");
  });
  it("renders relative time", () => {
    const now = 1_700_000_000_000;
    expect(timeAgo(now / 1000 - 90, now)).toBe("1m ago");
    expect(timeAgo(now / 1000 - 7200, now)).toBe("2h ago");
  });
});

describe("parseAmount (never floats)", () => {
  it("parses exact base units", () => {
    expect(parseAmount("1.5", 6).value).toBe(1_500_000n);
    expect(parseAmount("0.000001", 6).value).toBe(1n);
    expect(parseAmount(".5", 6).value).toBe(500_000n);
  });
  it("rejects bad input", () => {
    expect(parseAmount("", 6).error).toBeDefined();
    expect(parseAmount("abc", 6).error).toBeDefined();
    expect(parseAmount("1.0000001", 6).error).toMatch(/decimal/);
    expect(parseAmount("0", 6).error).toBeDefined();
    expect(parseAmount("-1", 6).error).toBeDefined();
    expect(parseAmount("5", 6, { max: 4_000_000n }).error).toMatch(/balance/);
  });
  it("allows zero when asked (revoke flows)", () => {
    expect(parseAmount("0", 6, { allowZero: true }).value).toBe(0n);
  });
});

describe("card validation", () => {
  it("luhn", () => {
    expect(luhn("4242 4242 4242 4242")).toBe(true);
    expect(luhn("4242 4242 4242 4241")).toBe(false);
  });
  it("schema validates expiry and cvc", () => {
    const ok = { name: "Ada Lovelace", number: "4242 4242 4242 4242", exp: "12 / 99", cvc: "123" };
    expect(cardSchema.safeParse(ok).success).toBe(true);
    expect(cardSchema.safeParse({ ...ok, exp: "01 / 20" }).success).toBe(false);
    expect(cardSchema.safeParse({ ...ok, cvc: "12" }).success).toBe(false);
  });
  it("gateway request schema caps batch size", () => {
    expect(gatewayRequestSchema.safeParse({ chainId: 31337, modelId: 1, calls: 5 }).success).toBe(true);
    expect(gatewayRequestSchema.safeParse({ chainId: 31337, modelId: 1, calls: 5000 }).success).toBe(false);
    expect(gatewayRequestSchema.safeParse({ chainId: 31337, modelId: 0, calls: 1 }).success).toBe(false);
  });
});
