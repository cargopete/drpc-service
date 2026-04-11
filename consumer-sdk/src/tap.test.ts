import { describe, it, expect } from "vitest";
import { buildReceipt, signReceipt } from "./tap.js";
import { verifyTypedData } from "viem";

// Standard Hardhat/Anvil test key #0 — safe for test use.
const ANVIL_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const ANVIL_ADDRESS =
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`;

const DATA_SERVICE =
  "0x1000000000000000000000000000000000000001" as `0x${string}`;
const PROVIDER =
  "0x2000000000000000000000000000000000000002" as `0x${string}`;
const TALLY_COLLECTOR =
  "0x3000000000000000000000000000000000000003" as `0x${string}`;

// Mirror of the type definition in tap.ts — kept in sync manually.
// This is intentionally duplicated here so changes to tap.ts break this test.
const RECEIPT_TYPES = {
  Receipt: [
    { name: "dataService", type: "address" },
    { name: "serviceProvider", type: "address" },
    { name: "timestamp_ns", type: "uint64" },
    { name: "nonce", type: "uint64" },
    { name: "value", type: "uint128" },
    { name: "metadata", type: "bytes" },
  ],
} as const;

describe("buildReceipt", () => {
  it("creates a receipt with the expected field values", () => {
    const r = buildReceipt(DATA_SERVICE, PROVIDER, 1_000_000n);
    expect(r.dataService).toBe(DATA_SERVICE);
    expect(r.serviceProvider).toBe(PROVIDER);
    expect(r.value).toBe(1_000_000n);
    expect(r.metadata).toBe("0x");
    expect(typeof r.timestampNs).toBe("bigint");
    expect(r.timestampNs).toBeGreaterThan(0n);
  });

  it("accepts custom metadata", () => {
    const r = buildReceipt(DATA_SERVICE, PROVIDER, 1n, "0xdeadbeef");
    expect(r.metadata).toBe("0xdeadbeef");
  });

  it("produces unique nonces across rapid successive calls", () => {
    const nonces = new Set(
      Array.from({ length: 50 }, () =>
        buildReceipt(DATA_SERVICE, PROVIDER, 1n).nonce
      )
    );
    // With random 53-bit nonces, collisions in 50 draws are astronomically unlikely
    expect(nonces.size).toBeGreaterThan(45);
  });
});

describe("signReceipt", () => {
  it("produces a 65-byte EIP-712 signature", async () => {
    const receipt = buildReceipt(DATA_SERVICE, PROVIDER, 1n);
    const { signature } = await signReceipt(
      receipt,
      { verifyingContract: TALLY_COLLECTOR },
      ANVIL_KEY
    );
    // 0x + 130 hex chars = 65 bytes
    expect(signature).toMatch(/^0x[0-9a-f]{130}$/i);
  });

  it("produces a signature verifiable by viem verifyTypedData", async () => {
    const receipt = buildReceipt(DATA_SERVICE, PROVIDER, 1_000_000n);
    const { signature } = await signReceipt(
      receipt,
      { verifyingContract: TALLY_COLLECTOR },
      ANVIL_KEY
    );

    const valid = await verifyTypedData({
      address: ANVIL_ADDRESS,
      domain: {
        name: "TAP",
        version: "1",
        chainId: 42161,
        verifyingContract: TALLY_COLLECTOR,
      },
      types: RECEIPT_TYPES,
      primaryType: "Receipt",
      message: {
        dataService: receipt.dataService,
        serviceProvider: receipt.serviceProvider,
        timestamp_ns: receipt.timestampNs,
        nonce: receipt.nonce,
        value: receipt.value,
        metadata: receipt.metadata,
      },
      signature,
    });

    expect(valid).toBe(true);
  });

  it("returns the original receipt alongside the signature", async () => {
    const receipt = buildReceipt(DATA_SERVICE, PROVIDER, 42n);
    const signed = await signReceipt(receipt, { verifyingContract: TALLY_COLLECTOR }, ANVIL_KEY);
    expect(signed.receipt).toBe(receipt);
  });

  it("respects a custom chainId in the domain", async () => {
    const receipt = buildReceipt(DATA_SERVICE, PROVIDER, 1n);
    // Sign on Arbitrum Sepolia (421614) — signature should NOT verify against Arbitrum One (42161)
    const { signature } = await signReceipt(
      receipt,
      { verifyingContract: TALLY_COLLECTOR, chainId: 421614 },
      ANVIL_KEY
    );
    const validOnMainnet = await verifyTypedData({
      address: ANVIL_ADDRESS,
      domain: { name: "TAP", version: "1", chainId: 42161, verifyingContract: TALLY_COLLECTOR },
      types: RECEIPT_TYPES,
      primaryType: "Receipt",
      message: {
        dataService: receipt.dataService,
        serviceProvider: receipt.serviceProvider,
        timestamp_ns: receipt.timestampNs,
        nonce: receipt.nonce,
        value: receipt.value,
        metadata: receipt.metadata,
      },
      signature,
    });
    expect(validOnMainnet).toBe(false);
  });
});
