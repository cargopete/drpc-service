/**
 * Compute unit weights per JSON-RPC method.
 *
 * Reflects relative backend processing cost on a scale of 1–20 CU:
 *   1 CU  — constant-time reads (blockNumber, chainId, gasPrice)
 *   2 CU  — single-account state reads
 *   3 CU  — transaction / receipt lookups
 *   5 CU  — block reads, estimateGas, subscriptions
 *   10 CU — potentially unbounded computation (eth_call, eth_getLogs)
 *   20 CU — full execution tracing (debug_*, trace_*)
 */
const METHOD_CU: Record<string, number> = {
  // 1 CU — near-zero backend cost
  eth_blockNumber: 1,
  eth_chainId: 1,
  eth_gasPrice: 1,
  eth_maxPriorityFeePerGas: 1,
  eth_unsubscribe: 1,
  net_version: 1,
  net_listening: 1,
  net_peerCount: 1,
  web3_clientVersion: 1,
  web3_sha3: 1,

  // 2 CU — single-account state
  eth_getBalance: 2,
  eth_getTransactionCount: 2,
  eth_getBlockTransactionCountByHash: 2,
  eth_getBlockTransactionCountByNumber: 2,
  eth_getUncleCountByBlockHash: 2,
  eth_getUncleCountByBlockNumber: 2,

  // 3 CU — transaction and receipt lookups
  eth_getCode: 3,
  eth_getStorageAt: 3,
  eth_getTransactionByHash: 3,
  eth_getTransactionByBlockHashAndIndex: 3,
  eth_getTransactionByBlockNumberAndIndex: 3,
  eth_getTransactionReceipt: 3,
  eth_sendRawTransaction: 3,
  eth_getUncleByBlockHashAndIndex: 3,
  eth_getUncleByBlockNumberAndIndex: 3,

  // 5 CU — block retrieval, fee history, subscriptions
  eth_getBlockByHash: 5,
  eth_getBlockByNumber: 5,
  eth_getBlockReceipts: 5,
  eth_estimateGas: 5,
  eth_feeHistory: 5,
  eth_getProof: 5,
  eth_subscribe: 5,
  eth_syncing: 5,

  // 10 CU — potentially unbounded computation
  eth_call: 10,
  eth_getLogs: 10,
  eth_newFilter: 10,
  eth_newBlockFilter: 10,
  eth_newPendingTransactionFilter: 10,
  eth_getFilterChanges: 10,
  eth_getFilterLogs: 10,
  eth_uninstallFilter: 10,

  // 20 CU — full execution tracing
  debug_traceTransaction: 20,
  debug_traceCall: 20,
  debug_traceBlockByHash: 20,
  debug_traceBlockByNumber: 20,
  debug_traceCallMany: 20,
  trace_transaction: 20,
  trace_block: 20,
  trace_call: 20,
  trace_callMany: 20,
  trace_rawTransaction: 20,
  trace_replayTransaction: 20,
  trace_replayBlockTransactions: 20,
  trace_get: 20,
  trace_filter: 20,
};

/** Fallback CU for unrecognised methods. */
const DEFAULT_CU = 5;

/**
 * Return the compute-unit weight for a JSON-RPC method name.
 * Unknown methods default to `DEFAULT_CU` (5).
 */
export function methodCU(method: string): number {
  return METHOD_CU[method] ?? DEFAULT_CU;
}

/**
 * Compute the GRT wei value to attach to a TAP receipt for a given method.
 *
 * `value = methodCU(method) × basePricePerCU`
 *
 * @param method        JSON-RPC method name (e.g. `"eth_call"`)
 * @param basePricePerCU GRT wei per compute unit (e.g. `4_000_000_000_000n` ≈ 4e-6 GRT/CU)
 */
export function computeReceiptValue(method: string, basePricePerCU: bigint): bigint {
  return BigInt(methodCU(method)) * basePricePerCU;
}
