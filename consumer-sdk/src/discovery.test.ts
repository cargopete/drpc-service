import { describe, it, expect, vi, afterEach } from "vitest";
import { discoverProviders } from "./discovery.js";
import { CapabilityTier } from "./types.js";

const SUBGRAPH_URL = "https://api.thegraph.com/subgraphs/test";

function mockFetch(body: unknown, ok = true, statusText = ok ? "OK" : "Internal Server Error"): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      statusText,
      json: async () => body,
    })
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

const SUBGRAPH_RESPONSE = {
  data: {
    indexers: [
      {
        id: "0xaaaa",
        address: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
        geoHash: "u1hx",
        paymentsDestination: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
        chains: [
          { chainId: "1", tier: 0, endpoint: "https://rpc.provider-a.com" },
        ],
      },
      {
        id: "0xbbbb",
        address: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
        geoHash: "gcpv",
        paymentsDestination: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
        chains: [], // no active chains — must be filtered out
      },
    ],
  },
};

describe("discoverProviders", () => {
  it("returns only indexers with active chains", async () => {
    mockFetch(SUBGRAPH_RESPONSE);
    const providers = await discoverProviders(SUBGRAPH_URL, 1, CapabilityTier.Standard);
    expect(providers).toHaveLength(1);
    expect(providers[0].address).toBe("0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa");
  });

  it("maps fields from subgraph shape to Provider shape", async () => {
    mockFetch(SUBGRAPH_RESPONSE);
    const [p] = await discoverProviders(SUBGRAPH_URL, 1, CapabilityTier.Standard);
    expect(p.geoHash).toBe("u1hx");
    expect(p.paymentsDestination).toBe("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB");
    expect(p.services[0].chainId).toBe(1);
    expect(p.services[0].tier).toBe(CapabilityTier.Standard);
    expect(p.services[0].endpoint).toBe("https://rpc.provider-a.com");
  });

  it("sets default qosScore of 0.5", async () => {
    mockFetch(SUBGRAPH_RESPONSE);
    const [p] = await discoverProviders(SUBGRAPH_URL, 1, CapabilityTier.Standard);
    expect(p.qosScore).toBe(0.5);
  });

  it("returns empty array when subgraph has no indexers", async () => {
    mockFetch({ data: { indexers: [] } });
    const providers = await discoverProviders(SUBGRAPH_URL, 1, CapabilityTier.Standard);
    expect(providers).toHaveLength(0);
  });

  it("throws on HTTP error status", async () => {
    mockFetch({}, false, "Bad Gateway");
    await expect(
      discoverProviders(SUBGRAPH_URL, 1, CapabilityTier.Standard)
    ).rejects.toThrow(/Bad Gateway/);
  });

  it("throws on GraphQL errors", async () => {
    mockFetch({ errors: [{ message: "field 'indexers' not found" }] });
    await expect(
      discoverProviders(SUBGRAPH_URL, 1, CapabilityTier.Standard)
    ).rejects.toThrow("field 'indexers' not found");
  });

  it("sends the correct chainId and tier as GraphQL variables", async () => {
    const mockFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ data: { indexers: [] } }),
    });
    vi.stubGlobal("fetch", mockFn);

    await discoverProviders(SUBGRAPH_URL, 137, CapabilityTier.Archive);

    const [, init] = mockFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.variables.chainId).toBe("137");
    expect(body.variables.tier).toBe(CapabilityTier.Archive);
  });
});
