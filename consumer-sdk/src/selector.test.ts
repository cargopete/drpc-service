import { describe, it, expect } from "vitest";
import { selectProvider, updateQosScore } from "./selector.js";
import type { Provider } from "./types.js";

function makeProvider(address: `0x${string}`, qosScore: number): Provider {
  return {
    address,
    geoHash: "u1hx",
    paymentsDestination: address,
    services: [{ chainId: 1, tier: 0, endpoint: "https://example.com" }],
    qosScore,
  };
}

describe("selectProvider", () => {
  it("throws on empty array", () => {
    expect(() => selectProvider([])).toThrow("no providers available");
  });

  it("returns the only available provider", () => {
    const p = makeProvider("0x1000000000000000000000000000000000000001", 0.5);
    expect(selectProvider([p])).toBe(p);
  });

  it("always selects the high-score provider when all others are zero", () => {
    const high = makeProvider("0x1000000000000000000000000000000000000001", 1.0);
    const low1 = makeProvider("0x1000000000000000000000000000000000000002", 0.0);
    const low2 = makeProvider("0x1000000000000000000000000000000000000003", 0.0);

    for (let i = 0; i < 100; i++) {
      expect(selectProvider([high, low1, low2])).toBe(high);
    }
  });

  it("falls back to uniform random when all scores are zero", () => {
    const providers = [
      makeProvider("0x1000000000000000000000000000000000000001", 0),
      makeProvider("0x1000000000000000000000000000000000000002", 0),
      makeProvider("0x1000000000000000000000000000000000000003", 0),
    ];
    const counts = new Map<string, number>();
    for (let i = 0; i < 300; i++) {
      const p = selectProvider(providers);
      counts.set(p.address, (counts.get(p.address) ?? 0) + 1);
    }
    // Each of three providers should appear at least 20 times in 300 draws
    for (const [, count] of counts) {
      expect(count).toBeGreaterThan(20);
    }
  });

  it("selects proportionally to score (statistical)", () => {
    const heavy = makeProvider("0x1000000000000000000000000000000000000001", 9.0);
    const light = makeProvider("0x1000000000000000000000000000000000000002", 1.0);
    let heavyCount = 0;
    for (let i = 0; i < 1000; i++) {
      if (selectProvider([heavy, light]) === heavy) heavyCount++;
    }
    // Should be selected ~90% of the time; allow wide margin
    expect(heavyCount).toBeGreaterThan(700);
    expect(heavyCount).toBeLessThan(990);
  });
});

describe("updateQosScore", () => {
  it("low latency (50ms) increases a below-average score", () => {
    const updated = updateQosScore(0.5, 50);
    expect(updated).toBeGreaterThan(0.5);
  });

  it("high latency (2000ms) produces zero contribution", () => {
    // alpha=1 means instant full update — tests the latency→score mapping
    const updated = updateQosScore(1.0, 2000, 1.0);
    expect(updated).toBeCloseTo(0, 5);
  });

  it("latency beyond 2000ms clamps latencyScore to 0", () => {
    const updated = updateQosScore(1.0, 9999, 1.0);
    expect(updated).toBe(0);
  });

  it("preserves existing score with alpha=0", () => {
    const updated = updateQosScore(0.7, 50, 0);
    expect(updated).toBe(0.7);
  });
});
