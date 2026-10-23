"use client";
import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePublicClient, useSignTypedData, useSwitchChain, useWriteContract, useAccount } from "wagmi";
import type { Abi, Address, Hex, PublicClient, TransactionReceipt } from "viem";
import { decodeTxError, type DecodedTxError } from "@/lib/web3/errors";
import { useUi } from "@/lib/store/ui";
import { KNOWN_CHAINS } from "@/lib/web3/chains";

export interface ContractCall {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}

export type StepPhase = "pending" | "active" | "signing" | "confirming" | "done" | "error";
export interface StepView { id: string; label: string; phase: StepPhase; hash?: Hex }
export interface FlowStepDef { id: string; label: string; exec: (api: FlowApi) => Promise<void> }
export interface FlowApi {
  /** simulate → ask wallet to sign → wait for the receipt. Throws on revert. */
  write(call: ContractCall): Promise<{ hash: Hex; receipt: TransactionReceipt }>;
  signTypedData(args: Parameters<ReturnType<typeof useSignTypedData>["signTypedDataAsync"]>[0]): Promise<Hex>;
}

export type FlowStatus = "idle" | "running" | "success" | "error";

class FlowError extends Error {
  constructor(public decoded: DecodedTxError) { super(decoded.message); }
}

/**
 * The transaction lifecycle as an explicit state machine:
 *   idle → running(step: active → signing → confirming → done)… → success | error
 * Every on-chain action in the app goes through this hook, which gives us in one place:
 *   • network guard (auto-switch chain)          • pre-flight simulation (revert reasons *before* the wallet pops up)
 *   • double-submit lock (reentrancy-aware UI)   • decoded, human-readable errors
 *   • cache invalidation + toasts on completion
 */
export function useTxFlow(opts: { chainId: number; title: string }) {
  const { chainId, title } = opts;
  const { address, chainId: walletChainId } = useAccount();
  const publicClient = usePublicClient({ chainId }) as PublicClient | undefined;
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();
  const { switchChainAsync } = useSwitchChain();
  const qc = useQueryClient();
  const push = useUi((s) => s.pushToast);

  const [steps, setSteps] = useState<StepView[]>([]);
  const [status, setStatus] = useState<FlowStatus>("idle");
  const [error, setError] = useState<DecodedTxError | undefined>();
  const [lastHash, setLastHash] = useState<Hex | undefined>();
  const lock = useRef(false);

  const patch = useCallback((id: string, p: Partial<StepView>) => setSteps((s) => s.map((x) => (x.id === id ? { ...x, ...p } : x))), []);

  const reset = useCallback(() => { if (!lock.current) { setSteps([]); setStatus("idle"); setError(undefined); setLastHash(undefined); } }, []);

  const run = useCallback(
    async (defs: FlowStepDef[]): Promise<boolean> => {
      if (lock.current) return false; // ignore double-clicks while a flow is in flight
      lock.current = true;
      setError(undefined);
      setLastHash(undefined);
      setStatus("running");
      setSteps(defs.map((d) => ({ id: d.id, label: d.label, phase: "pending" })));
      let currentId = defs[0]?.id ?? "";
      let hash: Hex | undefined;

      try {
        if (!address) throw new FlowError({ kind: "unknown", title: "Wallet not connected", message: "Connect a wallet to continue." });
        if (!publicClient) throw new FlowError({ kind: "network", title: "No RPC client", message: "This network is not configured." });
        if (walletChainId !== chainId) {
          try { await switchChainAsync({ chainId }); }
          catch (e) { throw new FlowError({ ...decodeTxError(e), kind: "wrong-chain", title: "Network switch required", message: `Switch your wallet to ${KNOWN_CHAINS[chainId]?.name ?? `chain ${chainId}`} to continue.` }); }
        }

        for (const def of defs) {
          currentId = def.id;
          patch(def.id, { phase: "active" });
          const api: FlowApi = {
            write: async (call) => {
              try {
                const sim = await publicClient.simulateContract({ account: address, ...(call as object) } as never) as { request: object };
                patch(def.id, { phase: "signing" });
                const h = await writeContractAsync({ ...(sim.request as object), chainId } as never);
                hash = h;
                patch(def.id, { phase: "confirming", hash: h });
                const receipt = await publicClient.waitForTransactionReceipt({ hash: h });
                if (receipt.status !== "success") throw new FlowError({ kind: "reverted", title: "Transaction reverted", message: "The transaction was mined but reverted on-chain." });
                return { hash: h, receipt };
              } catch (e) {
                throw e instanceof FlowError ? e : new FlowError(decodeTxError(e));
              }
            },
            signTypedData: async (args) => {
              patch(def.id, { phase: "signing" });
              try { return await signTypedDataAsync(args); }
              catch (e) { throw new FlowError(decodeTxError(e)); }
            },
          };
          await def.exec(api);
          patch(def.id, { phase: "done" });
        }

        setLastHash(hash);
        setStatus("success");
        push({ kind: "success", title, message: "Confirmed on-chain.", hash, chainId });
        qc.invalidateQueries({ queryKey: ["nh", chainId] });
        return true;
      } catch (e) {
        const decoded = e instanceof FlowError ? e.decoded : decodeTxError(e);
        patch(currentId, { phase: "error" });
        setError(decoded);
        setStatus("error");
        if (decoded.kind !== "rejected") push({ kind: "error", title: decoded.title, message: decoded.message, chainId });
        return false;
      } finally {
        lock.current = false;
      }
    },
    [address, publicClient, walletChainId, chainId, switchChainAsync, writeContractAsync, signTypedDataAsync, patch, push, qc, title],
  );

  return { run, reset, steps, status, error, lastHash, isRunning: status === "running" };
}
