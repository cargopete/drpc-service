use alloy_primitives::{keccak256, Address, B256, U256};
use alloy_sol_types::SolValue;

use crate::types::{Receipt, RECEIPT_TYPE_STRING};

/// Compute the EIP-712 domain separator for a GraphTallyCollector deployment.
///
/// Must be called once at startup with the values matching the deployed contract.
///
/// Standard values for Arbitrum One:
///   name = "TAP", chain_id = 42161,
///   verifying_contract = 0x8f69F5C07477Ac46FBc491B1E6D91E2be0111A9e
pub fn domain_separator(name: &str, chain_id: u64, verifying_contract: Address) -> B256 {
    let type_hash = keccak256(
        b"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
    );
    let encoded = (
        type_hash,
        keccak256(name.as_bytes()),
        keccak256(b"1"),
        U256::from(chain_id),
        verifying_contract,
    )
        .abi_encode();
    keccak256(&encoded)
}

/// Compute the full EIP-712 message hash for a receipt.
/// hash = keccak256(0x1901 || domainSeparator || structHash)
pub fn eip712_hash(domain_sep: B256, receipt: &Receipt) -> B256 {
    let struct_hash = receipt_struct_hash(receipt);
    let mut buf = [0u8; 66];
    buf[0] = 0x19;
    buf[1] = 0x01;
    buf[2..34].copy_from_slice(domain_sep.as_slice());
    buf[34..66].copy_from_slice(struct_hash.as_slice());
    keccak256(&buf)
}

/// Compute the EIP-712 struct hash for a receipt.
/// keccak256(abi.encode(typeHash, data_service, service_provider, timestamp_ns,
///                       nonce, value, keccak256(metadata)))
pub fn receipt_struct_hash(r: &Receipt) -> B256 {
    let type_hash = keccak256(RECEIPT_TYPE_STRING.as_bytes());
    let encoded = (
        type_hash,
        r.data_service,
        r.service_provider,
        r.timestamp_ns,
        r.nonce,
        r.value,
        keccak256(&r.metadata), // dynamic bytes → keccak256 per EIP-712
    )
        .abi_encode();
    keccak256(&encoded)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_contract() -> Address {
        "0x8f69F5C07477Ac46FBc491B1E6D91E2be0111A9e".parse().unwrap()
    }

    #[test]
    fn domain_separator_deterministic() {
        let d1 = domain_separator("TAP", 42161, test_contract());
        let d2 = domain_separator("TAP", 42161, test_contract());
        assert_eq!(d1, d2);
    }

    #[test]
    fn domain_separator_differs_by_chain() {
        let d1 = domain_separator("TAP", 1, test_contract());
        let d2 = domain_separator("TAP", 42161, test_contract());
        assert_ne!(d1, d2);
    }

    #[test]
    fn struct_hash_differs_by_value() {
        let base = Receipt {
            data_service: Address::ZERO,
            service_provider: Address::ZERO,
            timestamp_ns: 1_000_000,
            nonce: 42,
            value: 100,
            metadata: Default::default(),
        };
        let mut modified = base.clone();
        modified.value = 200;
        assert_ne!(receipt_struct_hash(&base), receipt_struct_hash(&modified));
    }
}
