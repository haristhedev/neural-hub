import type { Page } from "@playwright/test";
import { createWalletClient, http, type Hex, type TypedDataDomain } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";

const RPC = process.env.E2E_RPC_URL ?? "http://127.0.0.1:8545";

async function rpc(method: string, params: unknown[]) {
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }) });
  const json = (await res.json()) as { result?: unknown; error?: { code: number; message: string; data?: unknown } };
  if (json.error) throw Object.assign(new Error(json.error.message), { code: json.error.code, data: json.error.data });
  return json.result;
}

export interface MockUser { address: `0x${string}`; privateKey: Hex }

/** A brand-new keypair funded with gas — every test run starts from a clean wallet (no faucet cooldown, no old licenses). */
export async function newMockUser(ethHex = "0x8ac7230489e80000" /* 10 ETH */): Promise<MockUser> {
  const privateKey = generatePrivateKey();
  const { address } = privateKeyToAccount(privateKey);
  await rpc("hardhat_setBalance", [address, ethHex]);
  return { address, privateKey };
}

/**
 * Installs a mock injected wallet (EIP-1193 + EIP-6963 announcement) in the page. Keys live in the Node test process:
 * signatures are produced locally with viem and transactions are broadcast to the local chain, so what the app
 * does (permit signing, simulate → write → receipt) is exactly what it would do with MetaMask.
 */
export async function installMockWallet(page: Page, user: MockUser, opts: { name?: string; rdns?: string } = {}) {
  const account = privateKeyToAccount(user.privateKey);
  const wallet = createWalletClient({ account, chain: hardhat, transport: http(RPC) });

  await page.exposeFunction("__nhRpc", async (method: string, params: unknown[]) => {
    switch (method) {
      case "personal_sign":
        return wallet.signMessage({ message: { raw: params[0] as Hex } });
      case "eth_signTypedData_v4": {
        const td = JSON.parse(params[1] as string) as { types: Record<string, { name: string; type: string }[]>; domain: Record<string, unknown>; primaryType: string; message: Record<string, unknown> };
        const { EIP712Domain: _omit, ...types } = td.types; void _omit;
        const message = Object.fromEntries(Object.entries(td.message).map(([k, v]) => {
          const field = types[td.primaryType]?.find((f) => f.name === k);
          return [k, field && /^u?int/.test(field.type) ? BigInt(v as string) : v];
        }));
        const domain = { ...td.domain, ...(td.domain.chainId !== undefined ? { chainId: BigInt(td.domain.chainId as string | number) } : {}) } as TypedDataDomain;
        return wallet.signTypedData({ domain, types, primaryType: td.primaryType, message });
      }
      case "eth_sendTransaction": {
        const t = params[0] as { to?: Hex; data?: Hex; value?: Hex; gas?: Hex };
        return wallet.sendTransaction({ to: t.to, data: t.data, value: t.value ? BigInt(t.value) : undefined, gas: t.gas ? BigInt(t.gas) : undefined });
      }
      default:
        return rpc(method, params);
    }
  });

  await page.addInitScript(
    ({ address, name, rdns }) => {
      const w = window as unknown as { __nhRpc: (m: string, p: unknown[]) => Promise<unknown> };
      const listeners: Record<string, Array<(...a: unknown[]) => void>> = {};
      let connected = sessionStorage.getItem("mock-connected") === "1";
      const provider = {
        isMock: true,
        on(ev: string, fn: (...a: unknown[]) => void) { (listeners[ev] ??= []).push(fn); },
        removeListener(ev: string, fn: (...a: unknown[]) => void) { listeners[ev] = (listeners[ev] ?? []).filter((f) => f !== fn); },
        async request({ method, params = [] }: { method: string; params?: unknown[] }) {
          switch (method) {
            case "eth_requestAccounts": connected = true; sessionStorage.setItem("mock-connected", "1"); return [address];
            case "eth_accounts": return connected ? [address] : [];
            case "wallet_switchEthereumChain": return null;
            case "wallet_getPermissions": case "wallet_requestPermissions": return [];
            case "personal_sign": return w.__nhRpc("personal_sign", params);
            default: return w.__nhRpc(method, params);
          }
        },
      };
      const info = { uuid: "00000000-0000-4000-8000-000000000001", name, icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=", rdns };
      const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
      window.addEventListener("eip6963:requestProvider", announce);
      announce();
    },
    { address: user.address, name: opts.name ?? "Mock Wallet", rdns: opts.rdns ?? "io.mock.wallet" },
  );
}
