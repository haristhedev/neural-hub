import { describe, expect, it } from "vitest";
import { ContractFunctionRevertedError, UserRejectedRequestError, BaseError } from "viem";
import { decodeTxError } from "@/lib/web3/errors";

describe("decodeTxError", () => {
  it("recognises wallet rejection", () => {
    expect(decodeTxError(new UserRejectedRequestError(new Error("no"))).kind).toBe("rejected");
    expect(decodeTxError(new Error("User denied transaction signature")).kind).toBe("rejected");
  });
  it("maps custom contract errors to friendly copy", () => {
    const revert = Object.assign(Object.create(ContractFunctionRevertedError.prototype), {
      name: "ContractFunctionRevertedError", shortMessage: "reverted", message: "reverted", data: { errorName: "NotModelOwner", args: [] },
      walk(fn: (e: unknown) => boolean) { return fn(this) ? this : null; },
    });
    const wrapper = new BaseError("x", { cause: revert });
    const out = decodeTxError(wrapper);
    expect(out.kind).toBe("reverted");
    expect(out.errorName).toBe("NotModelOwner");
    expect(out.message).toMatch(/owner/i);
  });
  it("falls back to unknown for arbitrary errors", () => {
    expect(decodeTxError(new Error("boom")).kind).toBe("unknown");
  });
});
