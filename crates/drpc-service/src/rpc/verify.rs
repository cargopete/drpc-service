//! Verification tier classification for Ethereum JSON-RPC methods.
//!
//! Tier 1 — Merkle-provable: responses can be verified via EIP-1186 eth_getProof.
//! Tier 2 — Quorum-verifiable: correct but requires re-execution or cross-referencing.
//! Tier 3 — Non-deterministic: implementation-specific; reputation scoring only.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VerificationTier {
    /// Response is verifiable via Ethereum Merkle-Patricia trie proofs.
    MerkleProvable,
    /// Response is deterministic but requires quorum or re-execution to verify.
    Quorum,
    /// Response is non-deterministic; no on-chain dispute possible.
    Reputation,
}

/// Classify an RPC method into its verification tier.
pub fn tier_for_method(method: &str) -> VerificationTier {
    match method {
        // --- Tier 1: Merkle-provable ---
        "eth_getBalance"
        | "eth_getTransactionCount"
        | "eth_getStorageAt"
        | "eth_getCode"
        | "eth_getProof"
        | "eth_getBlockByHash"
        | "eth_getBlockByNumber" => VerificationTier::MerkleProvable,

        // --- Tier 2: Quorum-verifiable ---
        "eth_chainId"
        | "net_version"
        | "eth_blockNumber"
        | "eth_sendRawTransaction"
        | "eth_getTransactionReceipt"
        | "eth_getTransactionByHash"
        | "eth_getTransactionByBlockHashAndIndex"
        | "eth_getTransactionByBlockNumberAndIndex"
        | "eth_call"
        | "eth_getLogs"
        | "eth_getBlockReceipts"
        | "eth_feeHistory" => VerificationTier::Quorum,

        // --- Tier 3: Non-deterministic ---
        "eth_estimateGas"
        | "eth_gasPrice"
        | "eth_maxPriorityFeePerGas"
        | "eth_syncing"
        | "net_peerCount"
        | "net_listening"
        | "eth_mining"
        | "eth_hashrate" => VerificationTier::Reputation,

        // Unknown methods default to Quorum (conservative)
        _ => VerificationTier::Quorum,
    }
}

/// Compute units (CU) for a given method.
/// Phase 1: all methods return the flat baseline weight.
/// Phase 2: expand this with per-method weights from the RFC.
pub fn cu_weight(method: &str) -> u32 {
    match method {
        "eth_chainId" | "net_version" | "eth_blockNumber" => 1,
        "eth_getBalance"
        | "eth_getTransactionCount"
        | "eth_getCode"
        | "eth_getStorageAt"
        | "eth_sendRawTransaction" => 5,
        "eth_getBlockByHash" | "eth_getBlockByNumber" => 5,
        "eth_call"
        | "eth_estimateGas"
        | "eth_getTransactionReceipt"
        | "eth_getTransactionByHash" => 10,
        "eth_getLogs" => 20,
        _ => 10, // conservative default
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merkle_provable_methods() {
        assert_eq!(
            tier_for_method("eth_getBalance"),
            VerificationTier::MerkleProvable
        );
        assert_eq!(
            tier_for_method("eth_getProof"),
            VerificationTier::MerkleProvable
        );
    }

    #[test]
    fn non_deterministic_methods() {
        assert_eq!(
            tier_for_method("eth_gasPrice"),
            VerificationTier::Reputation
        );
        assert_eq!(
            tier_for_method("eth_estimateGas"),
            VerificationTier::Reputation
        );
    }

    #[test]
    fn unknown_method_defaults_to_quorum() {
        assert_eq!(
            tier_for_method("debug_traceTransaction"),
            VerificationTier::Quorum
        );
    }
}
