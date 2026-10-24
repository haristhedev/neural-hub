"use client";
import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, type State } from "wagmi";
import { wagmiConfig } from "@/lib/web3/config";
import { useSolana } from "@/lib/solana/phantom";
import { useLiveEvents } from "@/hooks/useLiveEvents";
import { WalletModal } from "@/components/wallet/WalletModal";
import { Toaster } from "@/components/tx/Toaster";
import { NetworkBanner } from "@/components/layout/NetworkBanner";
import "@/lib/motion/gsap";

function Live() {
  useLiveEvents();
  const init = useSolana((s) => s.init);
  useEffect(() => init(), [init]);
  return null;
}

export function Providers({ children, initialState }: { children: ReactNode; initialState?: State }) {
  const [client] = useState(
    () => new QueryClient({
      defaultOptions: {
        queries: { staleTime: 10_000, refetchOnWindowFocus: false, retry: (n, e) => n < 2 && !/revert|rejected/i.test((e as Error)?.message ?? "") },
      },
    }),
  );
  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={client}>
        <Live />
        <NetworkBanner />
        {children}
        <WalletModal />
        <Toaster />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
