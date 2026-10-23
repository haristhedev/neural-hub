import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { enabledChains, rpcUrlFor } from "./chains";

const chains = enabledChains();
const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;

export const walletConnectEnabled = Boolean(wcProjectId);

export const wagmiConfig = createConfig({
  chains,
  ssr: true,
  storage: createStorage({ storage: cookieStorage }), // SSR-safe persistence → no hydration flicker on reconnect
  // EIP-6963 discovery is on by default: MetaMask, Phantom (EVM), Rabby, Coinbase… appear as their own connectors.
  multiInjectedProviderDiscovery: true,
  // keep live event polling snappy on local dev chains
  pollingInterval: 2_000,
  connectors: [
    injected({ shimDisconnect: true }), // fallback for wallets that do not announce via EIP-6963
    ...(wcProjectId
      ? [
          walletConnect({
            projectId: wcProjectId,
            showQrModal: true,
            metadata: {
              name: "NeuralHub",
              description: "Decentralized AI model marketplace",
              url: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
              icons: [],
            },
          }),
        ]
      : []),
  ],
  transports: Object.fromEntries(
    chains.map((c) => [c.id, http(rpcUrlFor(c), { batch: true, retryCount: 2 })]), // JSON-RPC batching
  ),
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
