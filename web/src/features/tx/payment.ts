import { maxUint256, type Address, type PublicClient } from "viem";
import type { Contracts } from "@/lib/web3/contracts";
import { buildPermitTypedData, splitSignature, type PermitSignature } from "./permit";
import type { ContractCall, FlowStepDef } from "./useTxFlow";

export type ApprovalMethod = "permit" | "approve" | "unlimited";

export interface PaidActionParams {
  client: PublicClient;
  c: Contracts;
  owner: Address;
  amount: bigint;
  allowance: bigint;
  method: ApprovalMethod;
  /** the marketplace call to make when allowance already covers `amount` / after an on-chain approve */
  action: ContractCall;
  actionLabel: string;
  /** the permit-aware variant of the same call (single transaction) */
  actionWithPermit: (sig: PermitSignature) => ContractCall;
}

/**
 * Turns "pay X for Y" into the minimal list of wallet interactions:
 *   allowance already ≥ X                → [action]
 *   permit  (EIP-2612, default)          → [sign permit (free), action]            ← one transaction
 *   approve (exact amount)               → [approve tx, action]
 *   unlimited                            → [approve(max) tx, action]  (UI flags this as risky)
 */
export function buildPaidSteps(p: PaidActionParams): FlowStepDef[] {
  const spender = p.c.marketplace.address;

  if (p.allowance >= p.amount) {
    return [{ id: "action", label: p.actionLabel, exec: async (api) => void (await api.write(p.action)) }];
  }

  if (p.method === "permit") {
    let sig: PermitSignature | undefined;
    return [
      {
        id: "permit",
        label: "Sign permit (gas-free)",
        exec: async (api) => {
          const { typed, deadline } = await buildPermitTypedData({ client: p.client, c: p.c, owner: p.owner, spender, value: p.amount });
          const raw = await api.signTypedData({ ...typed, account: p.owner } as never);
          sig = splitSignature(raw, deadline);
        },
      },
      { id: "action", label: p.actionLabel, exec: async (api) => void (await api.write(p.actionWithPermit(sig!))) },
    ];
  }

  const approveAmount = p.method === "unlimited" ? maxUint256 : p.amount;
  return [
    {
      id: "approve",
      label: p.method === "unlimited" ? "Approve unlimited NHUSD" : "Approve exact NHUSD amount",
      exec: async (api) => void (await api.write({ ...p.c.paymentToken, functionName: "approve", args: [spender, approveAmount] })),
    },
    { id: "action", label: p.actionLabel, exec: async (api) => void (await api.write(p.action)) },
  ];
}
