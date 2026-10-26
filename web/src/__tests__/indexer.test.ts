import { describe, expect, it } from "vitest";
import { bucketByDay, bucketByMonth, type TimestampedLog } from "@/lib/web3/indexer";

const log = (iso: string, v: number): TimestampedLog<{ v: number }> => ({ blockNumber: 1n, txHash: "0x00", logIndex: 0, timestamp: Date.parse(iso) / 1000, data: { v } });
const NOW = Date.parse("2026-06-15T12:00:00Z");

describe("bucketByMonth", () => {
  it("fills empty months, sums within a month, ignores out-of-window logs", () => {
    const out = bucketByMonth([log("2026-06-01T00:00:00Z", 5), log("2026-06-10T00:00:00Z", 7), log("2026-04-02T00:00:00Z", 3), log("2025-01-01T00:00:00Z", 99)], (l) => l.data.v, 6, NOW);
    expect(out.map((b) => b.label)).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun"]);
    expect(out.map((b) => b.value)).toEqual([0, 0, 0, 3, 0, 12]);
  });
});

describe("bucketByDay", () => {
  it("places logs on the right day, newest last", () => {
    const out = bucketByDay([log("2026-06-15T01:00:00Z", 2), log("2026-06-14T23:00:00Z", 4), log("2026-06-01T00:00:00Z", 9)], (l) => l.data.v, 3, NOW);
    expect(out).toEqual([0, 4, 2]);
  });
});
