import { z } from "zod";

/**
 * Decentralised-storage resolver (IPFS / Arweave / data: / https).
 * – tries several public gateways in order with a timeout, so one slow gateway doesn't block the UI
 * – never returns anything unsafe to put in an <img src>: only https, data:image/* and gateway URLs
 */
export const IPFS_GATEWAYS = ["https://ipfs.io/ipfs/", "https://cloudflare-ipfs.com/ipfs/", "https://dweb.link/ipfs/"] as const;
export const ARWEAVE_GATEWAY = "https://arweave.net/";

const CID_PATH = /^[a-zA-Z0-9]+(\/[^?#]*)?$/;
const SAFE_IMAGE_DATA = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml)(;charset=[\w-]+)?;base64,[A-Za-z0-9+/=]+$/;

export class UnsupportedUriError extends Error {
  constructor(uri: string) {
    super(`Unsupported or unsafe URI scheme: ${uri.slice(0, 40)}`);
    this.name = "UnsupportedUriError";
  }
}

/** Expand a storage URI into the list of HTTP(S) URLs worth trying (in priority order). */
export function toGatewayUrls(uri: string): string[] {
  if (uri.startsWith("ipfs://")) {
    const rest = uri.slice("ipfs://".length).replace(/^ipfs\//, "");
    if (!CID_PATH.test(rest)) throw new UnsupportedUriError(uri);
    return IPFS_GATEWAYS.map((g) => g + rest);
  }
  if (uri.startsWith("ar://")) {
    const rest = uri.slice("ar://".length);
    if (!/^[\w-]{20,}(\/.*)?$/.test(rest)) throw new UnsupportedUriError(uri);
    return [ARWEAVE_GATEWAY + rest];
  }
  if (uri.startsWith("https://")) return [uri];
  // plain http is allowed only for localhost dev servers
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(uri)) return [uri];
  throw new UnsupportedUriError(uri);
}

export function decodeDataUri(uri: string): string {
  const m = /^data:([^,]*?)(;base64)?,(.*)$/s.exec(uri);
  if (!m) throw new UnsupportedUriError(uri);
  const payload = m[3] ?? "";
  if (m[2]) {
    const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return decodeURIComponent(payload);
}

export interface FetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function fetchJsonFromUri(uri: string, { fetchImpl = fetch, timeoutMs = 6_000, signal }: FetchOptions = {}): Promise<unknown> {
  if (uri.startsWith("data:application/json")) return JSON.parse(decodeDataUri(uri));
  const urls = toGatewayUrls(uri);
  let lastError: unknown;
  for (const url of urls) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    signal?.addEventListener("abort", () => ctrl.abort(), { once: true });
    try {
      const res = await fetchImpl(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastError = e;
      if (signal?.aborted) throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All gateways failed");
}

/** URL that is safe to render in an <img>, or undefined. */
export function safeImageSrc(uri?: string): string | undefined {
  if (!uri) return undefined;
  if (uri.startsWith("data:")) return SAFE_IMAGE_DATA.test(uri) ? uri : undefined;
  try {
    return toGatewayUrls(uri)[0];
  } catch {
    return undefined;
  }
}

export const benchmarkSchema = z.object({
  dataset: z.string().max(80),
  score: z.string().max(40),
  latencyMs: z.number().nonnegative(),
  fidelity: z.number().min(0).max(100),
});

export const modelMetadataSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2_000).default(""),
  image: z.string().optional(),
  neuralhub: z
    .object({
      handle: z.string().max(40).default("anonymous"),
      framework: z.string().max(24).default("PyTorch"),
      params: z.string().max(16).default("—"),
      tags: z.array(z.string().max(32)).max(12).default([]),
      rating: z.number().min(0).max(5).default(0),
      benchmarks: z.array(benchmarkSchema).max(12).default([]),
      weights: z.string().optional(),
    })
    .default({ handle: "anonymous", framework: "PyTorch", params: "—", tags: [], rating: 0, benchmarks: [] }),
});

export type ModelMetadata = z.infer<typeof modelMetadataSchema>;

export async function loadModelMetadata(uri: string, opts?: FetchOptions): Promise<ModelMetadata> {
  const json = await fetchJsonFromUri(uri, opts);
  return modelMetadataSchema.parse(json); // validates untrusted, user-supplied JSON
}
