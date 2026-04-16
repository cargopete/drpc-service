# dispatch-tap

Shared library crate used by both `dispatch-service` and `dispatch-gateway`. Contains all TAP v2 (GraphTally) primitives.

---

## Types

```rust
pub struct Receipt {
    pub data_service: Address,
    pub service_provider: Address,
    pub timestamp_ns: u64,
    pub nonce: u64,
    pub value: u128,
    pub metadata: Bytes,
}

pub struct SignedReceipt {
    pub receipt: Receipt,
    pub signature: Signature,  // k256 ECDSA
}

pub struct ReceiptAggregateVoucher {
    pub data_service: Address,
    pub service_provider: Address,
    pub timestamp_ns: u64,
    pub value_aggregate: u128,  // cumulative, never resets
    pub metadata: Bytes,
}
```

---

## EIP-712 domain

The domain separator is fixed to the Arbitrum One `GraphTallyCollector`:

```rust
pub const EIP712_DOMAIN: Eip712Domain = Eip712Domain {
    chain_id: 42161,
    verifying_contract: address!("8f69F5C07477Ac46FBc491B1E6D91E2bb0111A9e"),
    // name and version from protocol config
};
```

---

## API

```rust
// Create and sign a receipt
let signed = dispatch_tap::create_receipt(
    &signer_key,
    data_service,
    service_provider,
    value_grt_wei,
    metadata,
)?;

// Compute EIP-712 hash (for verification)
let hash = dispatch_tap::eip712_receipt_hash(&receipt);

// Recover signer from signed receipt
let signer = dispatch_tap::recover_signer(&signed)?;
```

---

## Cross-language compatibility

The EIP-712 hash must be identical across Rust and Solidity. `contracts/test/EIP712CrossLanguage.t.sol` verifies this with a golden test — fixed inputs, pre-computed Rust hash checked against Solidity `_hashReceipt()`. Both the hash and ECDSA signature recovery are validated.
