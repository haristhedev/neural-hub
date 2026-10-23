"use client";
import { create } from "zustand";
import bs58 from "bs58";
import { useQuery } from "@tanstack/react-query";

/**
 * Phantom (Solana) wallet layer.
 * Phantom injects `window.phantom.solana`; we talk to it directly instead of pulling the full
 * wallet-adapter bundle into every page — it is only ever imported from the lazy-loaded Solana panel.
 */
interface PhantomPublicKey { toString(): string; toBytes(): Uint8Array }
interface PhantomProvider {
  isPhantom?: boolean;
  publicKey: PhantomPublicKey | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PhantomPublicKey }>;
  disconnect(): Promise<void>;
  signMessage(msg: Uint8Array, display?: "utf8" | "hex"): Promise<{ signature: Uint8Array; publicKey: PhantomPublicKey }>;
  on(event: "connect" | "disconnect" | "accountChanged", cb: (...a: unknown[]) => void): void;
  off(event: "connect" | "disconnect" | "accountChanged", cb: (...a: unknown[]) => void): void;
}

declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider };
    solana?: PhantomProvider;
  }
}

export const PHANTOM_INSTALL_URL = "https://phantom.app/download";
export const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com";
export const SOLANA_CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";

export function getPhantom(): PhantomProvider | undefined {
  if (typeof window === "undefined") return undefined;
  const p = window.phantom?.solana ?? (window.solana?.isPhantom ? window.solana : undefined);
  return p?.isPhantom ? p : undefined;
}

export type SolStatus = "disconnected" | "connecting" | "connected";

interface SolState {
  status: SolStatus;
  address?: string;
  error?: string;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signMessage: (message: string) => Promise<string>; // returns base58 signature
  init: () => () => void;
}

const isRejected = (e: unknown) => (e as { code?: number })?.code === 4001 || /reject/i.test((e as Error)?.message ?? "");

export const useSolana = create<SolState>((set) => ({
  status: "disconnected",

  async connect() {
    const phantom = getPhantom();
    if (!phantom) {
      set({ error: "Phantom is not installed." });
      return;
    }
    set({ status: "connecting", error: undefined });
    try {
      const { publicKey } = await phantom.connect();
      set({ status: "connected", address: publicKey.toString() });
    } catch (e) {
      set({ status: "disconnected", error: isRejected(e) ? "Connection request was rejected." : "Could not connect to Phantom." });
    }
  },

  async disconnect() {
    try { await getPhantom()?.disconnect(); } finally { set({ status: "disconnected", address: undefined }); }
  },

  async signMessage(message) {
    const phantom = getPhantom();
    if (!phantom) throw new Error("Phantom is not installed.");
    const { signature } = await phantom.signMessage(new TextEncoder().encode(message), "utf8");
    return bs58.encode(signature);
  },

  /** Silent re-connect for returning users + live account/disconnect events. Returns a cleanup fn. */
  init() {
    const phantom = getPhantom();
    if (!phantom) return () => {};
    phantom.connect({ onlyIfTrusted: true }).then(({ publicKey }) => set({ status: "connected", address: publicKey.toString() })).catch(() => {});
    const onDisconnect = () => set({ status: "disconnected", address: undefined });
    const onAccount = (pk: unknown) => {
      if (pk && typeof (pk as PhantomPublicKey).toString === "function") set({ status: "connected", address: (pk as PhantomPublicKey).toString() });
      else onDisconnect();
    };
    phantom.on("disconnect", onDisconnect);
    phantom.on("accountChanged", onAccount);
    return () => { phantom.off("disconnect", onDisconnect); phantom.off("accountChanged", onAccount); };
  },
}));

/** Native SOL balance via plain JSON-RPC (no @solana/web3.js needed for a read). */
export function useSolBalance(address?: string) {
  return useQuery({
    queryKey: ["nh-meta", "sol-balance", SOLANA_RPC, address],
    enabled: Boolean(address),
    refetchInterval: 20_000,
    queryFn: async () => {
      const res = await fetch(SOLANA_RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [address, { commitment: "confirmed" }] }),
      });
      const json = (await res.json()) as { result?: { value: number }; error?: { message: string } };
      if (json.error || !json.result) throw new Error(json.error?.message ?? "RPC error");
      return json.result.value / 1e9;
    },
  });
}
