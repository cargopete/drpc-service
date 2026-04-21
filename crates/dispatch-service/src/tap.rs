//! TAP v2 (GraphTally) receipt validation.
//!
//! Receipts are transmitted as JSON in the `TAP-Receipt` HTTP header.
//! Each receipt is an EIP-712 signed message. We recover the signer and
//! check it against the authorised sender list.

use alloy_primitives::{Address, B256};

use crate::error::ServiceError;

/// A receipt that has passed all validation checks.
pub struct ValidatedReceipt {
    pub receipt: dispatch_tap::Receipt,
    pub signer: Address,
    pub signature: String,
}

/// Decode and validate a TAP receipt from the `TAP-Receipt` HTTP header value.
pub fn validate_receipt(
    header_value: &str,
    domain_sep: B256,
    authorized_senders: &[Address],
    data_service: Address,
    service_provider: Address,
    max_age_ns: u64,
    now_ns: u64,
) -> Result<ValidatedReceipt, ServiceError> {
    let signed: dispatch_tap::SignedReceipt = serde_json::from_str(header_value)
        .map_err(|e| ServiceError::InvalidReceipt(e.to_string()))?;

    let r = &signed.receipt;

    if r.data_service != data_service {
        return Err(ServiceError::InvalidReceipt(format!(
            "data_service mismatch: expected {data_service}, got {}",
            r.data_service
        )));
    }

    if r.service_provider != service_provider {
        return Err(ServiceError::InvalidReceipt(format!(
            "service_provider mismatch: expected {service_provider}, got {}",
            r.service_provider
        )));
    }

    if now_ns.saturating_sub(r.timestamp_ns) > max_age_ns {
        return Err(ServiceError::ReceiptExpired);
    }

    let msg_hash = dispatch_tap::eip712_hash(domain_sep, r);
    let signer = dispatch_tap::recover_signer(msg_hash, &signed.signature)
        .map_err(|e| ServiceError::InvalidReceipt(format!("signature recovery failed: {e}")))?;

    if !authorized_senders.is_empty() && !authorized_senders.contains(&signer) {
        return Err(ServiceError::UnauthorizedSender(signer.to_string()));
    }

    Ok(ValidatedReceipt {
        receipt: signed.receipt,
        signer,
        signature: signed.signature,
    })
}
