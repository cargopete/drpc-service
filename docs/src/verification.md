# Verification

RPC responses can't be verified the same way subgraph POIs can — there's no single canonical output hash. Dispatch uses a three-tier model based on what's cryptographically provable.

---

## Tier 1 — Merkle-provable

Methods where the correct answer is derivable from Ethereum's Merkle-Patricia trie. These can be slashed on-chain.

| Method | Proof |
|---|---|
| `eth_getBalance` | `accountProof` → balance field |
| `eth_getTransactionCount` | `accountProof` → nonce field |
| `eth_getStorageAt` | `storageProof` → value |
| `eth_getCode` | `accountProof` → codeHash; verify `keccak256(code) == codeHash` |
| `eth_getProof` | Self-verifying |
| `eth_getBlockByHash` | `keccak256(RLP(header)) == hash` |

**Verification algorithm (EIP-1186):**

1. Confirm `keccak256(RLP(header)) == trustedBlockHash`
2. Walk `accountProof` from header's `stateRoot` to the leaf keyed by `keccak256(address)`
3. Verify extracted RLP account matches `[nonce, balance, storageHash, codeHash]`
4. For storage: walk `storageProof` from `storageHash` to the leaf keyed by `keccak256(storageKey)`

Proofs are 500B–5KB, generated in 5–20ms. They're attached on-demand or during random spot-checks, not on every request.

**Slashing:** A challenger submits a `Tier1FraudProof` — block hash, EIP-1186 account/storage proofs, claimed vs actual value. `RPCDataService.slash()` verifies via `StateProofVerifier.sol`. If valid: 10,000 GRT slashed, 50% bounty to the challenger.

**`dispatch-oracle`** maintains the `trustedStateRoots[blockHash]` mapping on Arbitrum that makes on-chain verification possible without a light client.

> No other decentralised RPC protocol currently uses Merkle proofs for on-chain slashing.

---

## Tier 2 — Quorum-verified

Methods that are deterministic but require EVM re-execution to verify. The gateway sends the request to N providers; majority response wins.

| Method | Priority |
|---|---|
| `eth_chainId`, `net_version` | P0 — static, trivially verified |
| `eth_blockNumber` | P0 — quorum + beacon chain comparison |
| `eth_sendRawTransaction` | P0 — self-authenticated, just relay |
| `eth_getTransactionReceipt` | P0 — quorum |
| `eth_call` | P1 — quorum; future: EVM re-execution |
| `eth_getLogs` | P1 — quorum |
| `eth_estimateGas`, `eth_gasPrice` | P1 — quorum sufficient |
| `eth_getTransactionByHash` | P1 — quorum |

Providers in the minority on a quorum response receive a QoS penalty. No on-chain slashing.

---

## Tier 3 — Reputation only

`eth_estimateGas`, `eth_gasPrice`, `eth_maxPriorityFeePerGas` — implementation-specific, no deterministic correct answer. Providers returning statistically anomalous values receive lower QoS scores and reduced traffic. No slashing mechanism exists or is planned.

---

## Response attestation

Every `dispatch-service` response carries an attestation header:

```
X-Dispatch-Attestation: <hex-encoded ECDSA signature>
```

The signed message is:

```
keccak256(abi.encode(
    chainId,
    keccak256(bytes(method)),
    keccak256(params),
    keccak256(response),
    blockNumber,
    blockHash
))
```

Signed with the indexer's operator key. Enables dispute submission for Tier 1 fraud proofs — the challenger can prove the attested response is inconsistent with the on-chain state root.
