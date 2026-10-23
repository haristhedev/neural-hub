import type { Address } from "viem";
import { marketplaceAbi, modelLicensesAbi, modelNFTAbi, nHUSDAbi } from "./abis.generated";
import { getDeployment, type Deployment } from "./deployments";

/**
 * Versioned contract registry.
 * ───────────────────────────
 * Components never import an ABI directly — they ask for `getContracts(chainId)`.
 * When a v2 contract ships with a different ABI, register it under a new version key and set
 * `version: "2"` in that chain's deployment entry: chains still on v1 keep working untouched,
 * and only the call sites whose signatures changed need adapting. That is what lets the frontend
 * evolve alongside (non-proxied) contract redeployments without a flag day.
 */
const ABI_SETS = {
  "1": { paymentToken: nHUSDAbi, modelNFT: modelNFTAbi, licenses: modelLicensesAbi, marketplace: marketplaceAbi },
} as const;

type AbiSet = (typeof ABI_SETS)["1"];

export interface ContractRef<A> {
  address: Address;
  abi: A;
}

export interface Contracts {
  deployment: Deployment;
  paymentToken: ContractRef<AbiSet["paymentToken"]>;
  modelNFT: ContractRef<AbiSet["modelNFT"]>;
  licenses: ContractRef<AbiSet["licenses"]>;
  marketplace: ContractRef<AbiSet["marketplace"]>;
}

export function getContracts(chainId?: number): Contracts | undefined {
  const deployment = getDeployment(chainId);
  if (!deployment) return undefined;
  const abis = ABI_SETS[(deployment.version ?? "1") as keyof typeof ABI_SETS] ?? ABI_SETS["1"];
  return {
    deployment,
    paymentToken: { address: deployment.addresses.paymentToken, abi: abis.paymentToken },
    modelNFT: { address: deployment.addresses.modelNFT, abi: abis.modelNFT },
    licenses: { address: deployment.addresses.licenses, abi: abis.licenses },
    marketplace: { address: deployment.addresses.marketplace, abi: abis.marketplace },
  };
}

export const knownAddresses = (c: Contracts): Address[] => [
  c.paymentToken.address,
  c.modelNFT.address,
  c.licenses.address,
  c.marketplace.address,
];

// ── domain constants shared by UI + server ────────────────────────────────
export const PAYMENT_DECIMALS = 6;
export const PAYMENT_SYMBOL = "NHUSD";

export const Tier = { None: 0, Personal: 1, Commercial: 2, Enterprise: 3 } as const;
export type TierId = 1 | 2 | 3;
export const TIERS: { id: TierId; key: "personal" | "commercial" | "enterprise"; label: string; blurb: string; perpetual: boolean }[] = [
  { id: 1, key: "personal", label: "Personal", blurb: "Individual usage rights · 12 months", perpetual: false },
  { id: 2, key: "commercial", label: "Commercial", blurb: "Business application rights · 12 months", perpetual: false },
  { id: 3, key: "enterprise", label: "Enterprise", blurb: "Organization-wide rights · perpetual", perpetual: true },
];

export const CATEGORIES = ["LLM", "Image Gen", "Audio", "Video", "Predictive", "NLP", "Security"] as const;
export const CATEGORY_LONG = ["Large Language Models", "Image Generation", "Audio Synthesis", "Video Diffusion", "Predictive Analytics", "Natural Language", "Security"] as const;

export const PLANS = {
  1: { id: 1, name: "Pro", tagline: "Creative Operator", features: ["10,000 API calls / mo", "Unlimited verified models", "Priority support", "Live analytics telemetry"] },
  2: { id: 2, name: "Team", tagline: "Collaborative workflows", features: ["50,000 API calls / mo", "Dedicated team workspace", "SSO & secure custody keys", "SLA uptime guarantees"] },
} as const;
export type PlanId = keyof typeof PLANS;
