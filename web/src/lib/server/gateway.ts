import "server-only";
import { createPublicClient, createWalletClient, http, keccak256, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { KNOWN_CHAINS, rpcUrlFor } from "@/lib/web3/chains";
import { getContracts } from "@/lib/web3/contracts";

/** Hardhat account #1 — the seeded GATEWAY_ROLE holder on the local chain. A public test key: never valid on a real network. */
const LOCAL_GATEWAY_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;

function gatewayKey(chainId: number): Hex {
  const k = process.env.GATEWAY_PRIVATE_KEY as Hex | undefined;
  if (k) return k;
  if (chainId === 31337 && process.env.NODE_ENV !== "production") return LOCAL_GATEWAY_KEY;
  throw new Error("GATEWAY_PRIVATE_KEY is not configured");
}

export function gatewayClients(chainId: number) {
  const chain = KNOWN_CHAINS[chainId];
  const contracts = getContracts(chainId);
  if (!chain || !contracts) return null;
  const transport = http(rpcUrlFor(chain));
  return {
    chain,
    contracts,
    publicClient: createPublicClient({ chain, transport }),
    walletClient: createWalletClient({ chain, transport, account: privateKeyToAccount(gatewayKey(chainId)) }),
  };
}

/** Serialises settlements from this process so concurrent requests don't race on the signer's nonce. */
let queue: Promise<unknown> = Promise.resolve();
export function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

export const newBatchId = (user: Address, modelId: number): Hex =>
  keccak256(toHex(`${user}:${modelId}:${Date.now()}:${Math.random()}`));

/** Deterministic placeholder "inference" so the demo needs no GPU backend. */
export function mockInference(category: number, prompt: string | undefined, calls: number) {
  const p = (prompt?.trim() || "hello").slice(0, 80);
  const outputs = [
    `[llm] Completion for “${p}”: Decentralised inference verified by 3 independent nodes.`,
    `[image] 1024×1024 render queued for “${p}” — seed 4242, guidance 7.5, steps 50.`,
    `[audio] 24kHz waveform synthesised for “${p}” (3.2s).`,
    `[video] 4s clip rendered for “${p}” at 24fps.`,
    `[predict] Forecast for “${p}”: volatility ↑ 2.4% (σ=0.11).`,
    `[nlp] Translated “${p}” → 14 target languages.`,
    `[security] Scanned “${p}”: 0 anomalies, risk score 0.03.`,
  ];
  return `${outputs[category] ?? outputs[0]}${calls > 1 ? ` (+${calls - 1} more)` : ""}`;
}
