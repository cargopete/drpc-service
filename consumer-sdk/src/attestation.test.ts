import { describe, it, expect } from "vitest";
import { computeAttestationHash, recoverAttestationSigner } from "./attestation.js";
import { privateKeyToAccount } from "viem/accounts";

// Standard Hardhat/Anvil test key #0 — safe for test use.
const ANVIL_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const ANVIL_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const BASE_PAYLOAD = {
  chainId: 1,
  method: "eth_getBalance",
  params: ["0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "latest"],
  response: "0x56bc75e2d63100000",
  blockNumber: 17_000_000n,
  blockHash:
    "0xd4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3" as `0x${string}`,
};

describe("computeAttestationHash", () => {
  it("returns a 32-byte hex string", () => {
    const hash = computeAttestationHash(BASE_PAYLOAD);
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  it("is deterministic for identical inputs", () => {
    expect(computeAttestationHash(BASE_PAYLOAD)).toBe(
      computeAttestationHash(BASE_PAYLOAD)
    );
  });

  it("changes when method changes", () => {
    const h1 = computeAttestationHash({ ...BASE_PAYLOAD, method: "eth_getBalance" });
    const h2 = computeAttestationHash({ ...BASE_PAYLOAD, method: "eth_call" });
    expect(h1).not.toBe(h2);
  });

  it("changes when chainId changes", () => {
    const h1 = computeAttestationHash({ ...BASE_PAYLOAD, chainId: 1 });
    const h2 = computeAttestationHash({ ...BASE_PAYLOAD, chainId: 42161 });
    expect(h1).not.toBe(h2);
  });

  it("changes when response changes", () => {
    const h1 = computeAttestationHash({ ...BASE_PAYLOAD, response: "0x100" });
    const h2 = computeAttestationHash({ ...BASE_PAYLOAD, response: "0x200" });
    expect(h1).not.toBe(h2);
  });

  it("changes when blockNumber changes", () => {
    const h1 = computeAttestationHash({ ...BASE_PAYLOAD, blockNumber: 1n });
    const h2 = computeAttestationHash({ ...BASE_PAYLOAD, blockNumber: 2n });
    expect(h1).not.toBe(h2);
  });

  it("changes when blockHash changes", () => {
    const h1 = computeAttestationHash({
      ...BASE_PAYLOAD,
      blockHash:
        "0x0000000000000000000000000000000000000000000000000000000000000001",
    });
    const h2 = computeAttestationHash({
      ...BASE_PAYLOAD,
      blockHash:
        "0x0000000000000000000000000000000000000000000000000000000000000002",
    });
    expect(h1).not.toBe(h2);
  });
});

describe("recoverAttestationSigner", () => {
  it("recovers the correct signer from a raw hash signature", async () => {
    const account = privateKeyToAccount(ANVIL_KEY);
    const hash = computeAttestationHash(BASE_PAYLOAD);
    const signature = await account.sign({ hash });
    const recovered = await recoverAttestationSigner(hash, signature);
    expect(recovered.toLowerCase()).toBe(ANVIL_ADDRESS.toLowerCase());
  });

  it("returns a different address for a tampered hash", async () => {
    const account = privateKeyToAccount(ANVIL_KEY);
    const hash = computeAttestationHash(BASE_PAYLOAD);
    const tamperedHash = computeAttestationHash({
      ...BASE_PAYLOAD,
      response: "tampered",
    });
    const signature = await account.sign({ hash });
    const recovered = await recoverAttestationSigner(tamperedHash, signature);
    expect(recovered.toLowerCase()).not.toBe(ANVIL_ADDRESS.toLowerCase());
  });
});
