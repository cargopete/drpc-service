use sqlx::Row;

use crate::{db::Pool, tap::ValidatedReceipt};

/// Persist a validated TAP receipt to PostgreSQL.
///
/// The AFTER INSERT trigger on `tap_receipts` fires a NOTIFY so the TAP agent
/// can immediately pick up the receipt for aggregation.
///
/// Returns the auto-assigned row `id`.
pub async fn insert(pool: &Pool, chain_id: u64, validated: &ValidatedReceipt) -> anyhow::Result<i64> {
    let row = sqlx::query(
        r#"
        INSERT INTO tap_receipts
            (signer_address, chain_id, timestamp_ns, nonce, value, signature, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
        "#,
    )
    .bind(format!("{:?}", validated.signer))   // lowercase hex with 0x prefix
    .bind(chain_id as i64)
    .bind(validated.receipt.timestamp_ns as i64)
    .bind(validated.receipt.nonce as i64)
    .bind(validated.receipt.value.to_string()) // u128 → decimal string
    .bind(&validated.signature)
    .bind(validated.receipt.metadata.as_ref()) // &[u8]
    .fetch_one(pool)
    .await?;

    Ok(row.get("id"))
}
