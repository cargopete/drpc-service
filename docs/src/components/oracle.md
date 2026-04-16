# dispatch-oracle

Lightweight daemon that feeds Ethereum L1 block headers to `RPCDataService` on Arbitrum One. Required for Tier 1 Merkle proof slashing — without it, `slash()` has no trusted state root to verify against.

---

## What it does

```
L1 Ethereum node
  → eth_getBlockByNumber("latest")   every ~12 seconds
  → deduplicate (skip already-seen block hashes)
  → RPCDataService.setTrustedStateRoot(blockHash, stateRoot)
  → Arbitrum One (Arbitrum tx)
```

The `trustedStateRoots` mapping in `RPCDataService` is keyed by block hash. When a challenger submits a `Tier1FraudProof`, the contract looks up the state root for the attested block hash and uses `StateProofVerifier.sol` to verify the EIP-1186 proof on-chain.

---

## Configuration

```toml
[oracle]
poll_interval_secs = 12    # one Ethereum block
tx_timeout_secs    = 120

[l1]
rpc_url = "https://eth-mainnet.example.com/YOUR_KEY"

[arbitrum]
rpc_url              = "https://arb1.arbitrum.io/rpc"
signer_private_key   = "0x..."   # must be RPCDataService owner or authorised caller
data_service_address = "0x73846272813065c3e4efdb3fb82e0d128c8c2364"
```

---

## Running

```bash
cp docker/oracle.example.toml oracle.toml
RUST_LOG=info cargo run --bin dispatch-oracle
```

---

## Current status

The oracle binary is implemented and tested but **not currently running** against the live provider. Tier 1 slashing is therefore not active on the live network. The oracle needs to be running before fraud proof challenges can be submitted.
