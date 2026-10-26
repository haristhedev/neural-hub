import { describe, expect, it, vi } from "vitest";
import { decodeDataUri, fetchJsonFromUri, loadModelMetadata, safeImageSrc, toGatewayUrls, UnsupportedUriError } from "@/lib/web3/ipfs";

const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

describe("toGatewayUrls", () => {
  it("expands ipfs:// across ordered gateways", () => {
    const urls = toGatewayUrls(`ipfs://${CID}/meta.json`);
    expect(urls).toHaveLength(3);
    expect(urls[0]).toBe(`https://ipfs.io/ipfs/${CID}/meta.json`);
  });
  it("accepts the ipfs://ipfs/<cid> legacy form", () => {
    expect(toGatewayUrls(`ipfs://ipfs/${CID}`)[0]).toContain(`/ipfs/${CID}`);
  });
  it("maps ar:// to one gateway and rejects short ids", () => {
    expect(toGatewayUrls("ar://abcdefghijklmnopqrstuvwxyz012345678901234")).toHaveLength(1);
    expect(() => toGatewayUrls("ar://short")).toThrow(UnsupportedUriError);
  });
  it("allows https, localhost http; blocks javascript:, file: and remote http", () => {
    expect(toGatewayUrls("https://example.com/a.json")).toEqual(["https://example.com/a.json"]);
    expect(toGatewayUrls("http://localhost:3000/a.json")).toHaveLength(1);
    for (const bad of ["javascript:alert(1)", "file:///etc/passwd", "http://evil.example/a.json", "ipfs://../../etc/passwd"]) {
      expect(() => toGatewayUrls(bad)).toThrow(UnsupportedUriError);
    }
  });
});

describe("data URIs + metadata", () => {
  const meta = { name: "Test", description: "d", neuralhub: { handle: "me", benchmarks: [] } };
  const b64 = `data:application/json;base64,${Buffer.from(JSON.stringify(meta)).toString("base64")}`;
  it("decodes base64 and percent-encoded payloads", () => {
    expect(JSON.parse(decodeDataUri(b64)).name).toBe("Test");
    expect(decodeDataUri("data:text/plain,hello%20world")).toBe("hello world");
  });
  it("loads + validates metadata, filling defaults", async () => {
    const m = await loadModelMetadata(b64);
    expect(m.name).toBe("Test");
    expect(m.neuralhub.framework).toBe("PyTorch");
  });
  it("rejects malformed metadata", async () => {
    const bad = `data:application/json;base64,${Buffer.from(JSON.stringify({ nope: 1 })).toString("base64")}`;
    await expect(loadModelMetadata(bad)).rejects.toThrow();
  });
});

describe("gateway fallback", () => {
  it("falls through failing gateways until one responds", async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(new Response("nope", { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const out = await fetchJsonFromUri(`ipfs://${CID}`, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it("throws when every gateway fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("down"));
    await expect(fetchJsonFromUri(`ipfs://${CID}`, { fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toThrow();
  });
});

describe("safeImageSrc", () => {
  it("allows raster/svg data URIs and gateway URLs, drops script-capable content", () => {
    expect(safeImageSrc("data:image/png;base64,AAAA")).toBeDefined();
    expect(safeImageSrc(`ipfs://${CID}`)).toContain(CID);
    expect(safeImageSrc("data:text/html;base64,PHNjcmlwdD4=")).toBeUndefined();
    expect(safeImageSrc("javascript:alert(1)")).toBeUndefined();
    expect(safeImageSrc(undefined)).toBeUndefined();
  });
});
