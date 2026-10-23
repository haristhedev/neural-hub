"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAddress } from "viem";
import { useAccount, useSignMessage } from "wagmi";
import { buildSignInMessage, SIGN_IN_STATEMENT, type Family } from "@/lib/auth/siwe";
import { useSolana } from "@/lib/solana/phantom";
import { decodeTxError } from "@/lib/web3/errors";

interface Session { address: string; family: Family }

/** Wallet login: sign a domain-bound, nonce-protected message → server verifies → httpOnly JWT cookie. */
export function useAuth() {
  const qc = useQueryClient();
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const sol = useSolana();

  const session = useQuery({
    queryKey: ["nh-meta", "session"],
    staleTime: 30_000,
    queryFn: async (): Promise<Session | null> => {
      const res = await fetch("/api/auth/session");
      if (!res.ok) return null; // misconfigured / unavailable server: treat as signed out, sign-in will explain why
      return ((await res.json()) as { session: Session | null }).session;
    },
  });

  const signIn = useMutation({
    mutationFn: async (family: Family) => {
      const addr = family === "evm" ? address : sol.address;
      if (!addr) throw new Error("Connect a wallet first");
      const nonceRes = await fetch("/api/auth/nonce");
      if (!nonceRes.ok) throw new Error(((await nonceRes.json().catch(() => ({}))) as { message?: string }).message ?? "Sign-in is temporarily unavailable.");
      const { nonce } = (await nonceRes.json()) as { nonce: string };
      const message = buildSignInMessage({
        family,
        domain: window.location.host,
        address: family === "evm" ? getAddress(addr) : addr,
        statement: SIGN_IN_STATEMENT,
        uri: window.location.origin,
        chainId: family === "evm" ? chainId : undefined,
        nonce,
        issuedAt: new Date().toISOString(),
      });
      const signature = family === "evm" ? await signMessageAsync({ message }) : await sol.signMessage(message);
      const res = await fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, signature }) });
      if (!res.ok) { const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string }; throw new Error(j.message ?? j.error ?? "Verification failed"); }
      return (await res.json()) as Session;
    },
    onSuccess: (s) => qc.setQueryData(["nh-meta", "session"], s),
  });

  const signOut = useMutation({
    mutationFn: async () => { await fetch("/api/auth/logout", { method: "POST" }); },
    onSuccess: () => qc.setQueryData(["nh-meta", "session"], null),
  });

  const evmSignedIn = !!address && session.data?.family === "evm" && session.data.address === address.toLowerCase();
  const solSignedIn = !!sol.address && session.data?.family === "solana" && session.data.address === sol.address.toLowerCase();
  const errorMessage = signIn.error ? (decodeTxError(signIn.error).kind === "rejected" ? "Signature request was rejected." : (signIn.error as Error).message) : undefined;

  return { session: session.data, evmSignedIn, solSignedIn, signIn, signOut, errorMessage };
}
