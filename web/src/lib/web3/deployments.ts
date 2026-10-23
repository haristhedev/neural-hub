import type { Address } from "viem";
import all from "./deployments/all.json";

export interface Deployment {
  chainId: number;
  network: string;
  /** first block to scan for logs — keeps indexer queries cheap */
  startBlock: number;
  gateway: Address;
  /** contract ABI/interface generation. Bump when a redeploy changes the ABI (see contracts.ts). */
  version?: string;
  addresses: {
    paymentToken: Address;
    modelNFT: Address;
    licenses: Address;
    marketplace: Address;
  };
}

const deployments = all as unknown as Record<string, Deployment>;

export function getDeployment(chainId?: number): Deployment | undefined {
  return chainId === undefined ? undefined : deployments[String(chainId)];
}

export const deployedChainIds = (): number[] => Object.keys(deployments).map(Number);
