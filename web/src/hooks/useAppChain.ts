"use client";
import { useAccount, useSwitchChain } from "wagmi";
import { defaultChain, enabledChains, KNOWN_CHAINS } from "@/lib/web3/chains";
import { getContracts } from "@/lib/web3/contracts";

/**
 * Single source of truth for "which chain is the app reading from / writing to".
 *  • wallet connected on a supported chain → that chain
 *  • otherwise → the default chain, so browsing keeps working read-only
 * `wrongNetwork` = wallet is connected but on a chain we do not support (writes are blocked until switched).
 */
export function useAppChain() {
  const { isConnected, chainId: walletChainId, address } = useAccount();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const supported = enabledChains();

  const walletSupported = isConnected && walletChainId !== undefined && supported.some((c) => c.id === walletChainId);
  const chainId = walletSupported ? walletChainId! : defaultChain().id;
  const chain = KNOWN_CHAINS[chainId]!;
  const contracts = getContracts(chainId);

  return {
    address,
    isConnected,
    chainId,
    chain,
    contracts,
    supportedChains: supported,
    /** connected, but the wallet sits on a chain this app does not support */
    wrongNetwork: isConnected && !walletSupported,
    /** chain is supported but NeuralHub contracts are not deployed there */
    notDeployed: !contracts,
    isSwitching,
    switchTo: (id: number) => switchChainAsync({ chainId: id }),
  };
}
