"use client";
import { useCallback } from "react";
import type { Address, Hex } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { useWatchContractEvent } from "wagmi";
import { formatUnits } from "viem";
import { useAppChain } from "./useAppChain";
import { useFeed } from "@/lib/store/feed";
import { PAYMENT_DECIMALS } from "@/lib/web3/contracts";
import { shortAddress } from "@/lib/web3/format";

/** Decoded event args, as the watchers below see them (one superset shape; each event fills its own fields). */
interface EventArgs { user: Address; buyer: Address; account: Address; to: Address; calls: bigint; modelId: bigint; tokenId: bigint; cost: bigint; price: bigint; amount: bigint }
interface DecodedLog { transactionHash: Hex; args: EventArgs }
/** `useWatchContractEvent` loses per-event arg typing when the ABI is optional, so narrow it once here. */
const asLogs = (logs: readonly unknown[]) => logs as DecodedLog[];

/**
 * Real-time UI: subscribes to contract events and (a) invalidates every chain query so numbers refresh,
 * (b) appends a human line to the live feed. Mount once, near the root.
 */
export function useLiveEvents() {
  const { chainId, contracts } = useAppChain();
  const qc = useQueryClient();
  const push = useFeed((s) => s.push);
  const enabled = Boolean(contracts);
  const usd = (v: bigint) => `$${Number(formatUnits(v, PAYMENT_DECIMALS)).toLocaleString("en-US", { maximumFractionDigits: 4 })}`;

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["nh", chainId] });
  }, [qc, chainId]);

  const m = contracts?.marketplace;
  const common = { chainId, enabled } as const;

  useWatchContractEvent({
    ...common, address: m?.address, abi: m?.abi, eventName: "UsageRecorded",
    onLogs: (logs) => { refresh(); asLogs(logs).forEach((l) => push({ kind: "usage", hash: l.transactionHash, text: `${shortAddress(l.args.user)} ran ${l.args.calls} call(s) on model #${l.args.modelId} · ${usd(l.args.cost)}` })); },
  });
  useWatchContractEvent({
    ...common, address: m?.address, abi: m?.abi, eventName: "LicensePurchased",
    onLogs: (logs) => { refresh(); asLogs(logs).forEach((l) => push({ kind: "license", hash: l.transactionHash, text: `${shortAddress(l.args.buyer)} licensed model #${l.args.modelId} · ${usd(l.args.price)}` })); },
  });
  useWatchContractEvent({
    ...common, address: m?.address, abi: m?.abi, eventName: "CreditsDeposited",
    onLogs: (logs) => { refresh(); asLogs(logs).forEach((l) => push({ kind: "credits", hash: l.transactionHash, text: `${shortAddress(l.args.account)} deposited ${usd(l.args.amount)} credits` })); },
  });
  useWatchContractEvent({
    ...common, address: m?.address, abi: m?.abi, eventName: "Claimed",
    onLogs: (logs) => { refresh(); asLogs(logs).forEach((l) => push({ kind: "claim", hash: l.transactionHash, text: `${shortAddress(l.args.account)} claimed ${usd(l.args.amount)} royalties` })); },
  });
  useWatchContractEvent({
    ...common, address: m?.address, abi: m?.abi, eventName: "ModelListed",
    onLogs: (logs) => { refresh(); asLogs(logs).forEach((l) => push({ kind: "model", hash: l.transactionHash, text: `Model #${l.args.modelId} listed` })); },
  });
  const nft = contracts?.modelNFT;
  useWatchContractEvent({
    ...common, address: nft?.address, abi: nft?.abi, eventName: "Transfer",
    onLogs: (logs) => { refresh(); asLogs(logs).forEach((l) => push({ kind: "transfer", hash: l.transactionHash, text: `Model #${l.args.tokenId} → ${shortAddress(l.args.to)}` })); },
  });
}
