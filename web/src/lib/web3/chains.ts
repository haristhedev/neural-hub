import { defineChain, type Chain } from "viem";
import { base, baseSepolia, mainnet, polygon, polygonAmoy, sepolia } from "viem/chains";

export const localhost = defineChain({
  id: 31337,
  name: "Localhost",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  testnet: true,
});

/** Every chain the UI knows how to talk to. Which are *enabled* is an env decision. */
export const KNOWN_CHAINS: Record<number, Chain> = {
  [localhost.id]: localhost,
  [baseSepolia.id]: baseSepolia,
  [sepolia.id]: sepolia,
  [polygonAmoy.id]: polygonAmoy,
  [base.id]: base,
  [polygon.id]: polygon,
  [mainnet.id]: mainnet,
};

export function enabledChains(): readonly [Chain, ...Chain[]] {
  const raw = process.env.NEXT_PUBLIC_ENABLED_CHAINS ?? "31337,84532";
  const list = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .map((id) => KNOWN_CHAINS[id])
    .filter((c): c is Chain => Boolean(c));
  return (list.length ? list : [localhost]) as unknown as readonly [Chain, ...Chain[]];
}

export function defaultChain(): Chain {
  const id = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN ?? 31337);
  return enabledChains().find((c) => c.id === id) ?? enabledChains()[0];
}

export function rpcUrlFor(chain: Chain): string {
  // NEXT_PUBLIC_RPC_<id> must be referenced statically for Next to inline it
  const overrides: Record<number, string | undefined> = {
    31337: process.env.NEXT_PUBLIC_RPC_31337,
    84532: process.env.NEXT_PUBLIC_RPC_84532,
    11155111: process.env.NEXT_PUBLIC_RPC_11155111,
    80002: process.env.NEXT_PUBLIC_RPC_80002,
    8453: process.env.NEXT_PUBLIC_RPC_8453,
    137: process.env.NEXT_PUBLIC_RPC_137,
    1: process.env.NEXT_PUBLIC_RPC_1,
  };
  return overrides[chain.id] || chain.rpcUrls.default.http[0]!;
}

export function explorerTxUrl(chain: Chain | undefined, hash: string): string | undefined {
  const base = chain?.blockExplorers?.default.url;
  return base ? `${base}/tx/${hash}` : undefined;
}

export function explorerAddressUrl(chain: Chain | undefined, address: string): string | undefined {
  const base = chain?.blockExplorers?.default.url;
  return base ? `${base}/address/${address}` : undefined;
}

export const isLocalChain = (id?: number) => id === localhost.id;
