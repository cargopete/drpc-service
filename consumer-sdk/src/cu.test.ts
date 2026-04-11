import { describe, it, expect } from "vitest";
import { methodCU, computeReceiptValue } from "./cu.js";

describe("methodCU", () => {
  it("returns 1 for cheap constant-time calls", () => {
    expect(methodCU("eth_blockNumber")).toBe(1);
    expect(methodCU("eth_chainId")).toBe(1);
    expect(methodCU("eth_gasPrice")).toBe(1);
  });

  it("returns 10 for eth_call and eth_getLogs", () => {
    expect(methodCU("eth_call")).toBe(10);
    expect(methodCU("eth_getLogs")).toBe(10);
  });

  it("returns 20 for debug and trace methods", () => {
    expect(methodCU("debug_traceTransaction")).toBe(20);
    expect(methodCU("trace_replayTransaction")).toBe(20);
    expect(methodCU("trace_call")).toBe(20);
  });

  it("returns 5 for block retrieval", () => {
    expect(methodCU("eth_getBlockByNumber")).toBe(5);
    expect(methodCU("eth_getBlockByHash")).toBe(5);
  });

  it("returns default (5) for unknown methods", () => {
    expect(methodCU("some_unknown_method")).toBe(5);
    expect(methodCU("")).toBe(5);
  });
});

describe("computeReceiptValue", () => {
  const BASE = 4_000_000_000_000n; // 4e-6 GRT per CU

  it("scales value by method CU", () => {
    expect(computeReceiptValue("eth_blockNumber", BASE)).toBe(1n * BASE);
    expect(computeReceiptValue("eth_call", BASE)).toBe(10n * BASE);
    expect(computeReceiptValue("debug_traceTransaction", BASE)).toBe(20n * BASE);
  });

  it("eth_call costs 10× eth_blockNumber", () => {
    const cheap = computeReceiptValue("eth_blockNumber", BASE);
    const expensive = computeReceiptValue("eth_call", BASE);
    expect(expensive).toBe(cheap * 10n);
  });

  it("returns 0 when basePricePerCU is 0", () => {
    expect(computeReceiptValue("eth_call", 0n)).toBe(0n);
  });

  it("uses default CU for unknown methods", () => {
    expect(computeReceiptValue("unknown_method", BASE)).toBe(5n * BASE);
  });
});
