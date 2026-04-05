use std::{sync::Arc, time::Instant};

use alloy_primitives::Bytes;
use axum::{
    extract::{Path, State},
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::task::JoinSet;

use crate::{error::GatewayError, registry::Provider, selector, server::AppState};
use drpc_tap::create_receipt;

pub fn router() -> Router<AppState> {
    Router::new().route("/rpc/{chain_id}", post(rpc_handler))
}

// ---------------------------------------------------------------------------
// JSON-RPC types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub method: String,
    #[serde(default)]
    pub params: Option<Value>,
    pub id: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<Value>,
    pub id: Option<Value>,
}

impl JsonRpcRequest {
    pub fn validate(&self) -> Result<(), GatewayError> {
        if self.jsonrpc != "2.0" {
            return Err(GatewayError::InvalidRequest(format!(
                "unsupported jsonrpc version: {}",
                self.jsonrpc
            )));
        }
        if self.method.is_empty() {
            return Err(GatewayError::InvalidRequest("method is empty".to_string()));
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async fn rpc_handler(
    State(state): State<AppState>,
    Path(chain_id): Path<u64>,
    Json(request): Json<JsonRpcRequest>,
) -> Result<Response, GatewayError> {
    request.validate()?;

    let (providers, chain_head) = state
        .registry
        .providers_for_chain(chain_id)
        .ok_or(GatewayError::UnsupportedChain(chain_id))?;

    if providers.is_empty() {
        return Err(GatewayError::NoProviders(chain_id));
    }

    let candidates = selector::select(providers, chain_head, state.config.qos.concurrent_k);

    let cu = cu_weight_for(&request.method);
    let receipt_value = cu as u128 * state.config.tap.base_price_per_cu;

    let (response, winner) =
        dispatch_concurrent(&state, chain_id, &request, &candidates, receipt_value).await?;

    tracing::debug!(
        method = %request.method,
        chain_id,
        provider = %winner.endpoint,
        cu,
        "served"
    );

    Ok(Json(response).into_response())
}

// ---------------------------------------------------------------------------
// Concurrent dispatch — first valid response wins
// ---------------------------------------------------------------------------

async fn dispatch_concurrent(
    state: &AppState,
    chain_id: u64,
    request: &JsonRpcRequest,
    candidates: &[Arc<Provider>],
    receipt_value: u128,
) -> Result<(JsonRpcResponse, Arc<Provider>), GatewayError> {
    let mut set: JoinSet<Result<(JsonRpcResponse, Arc<Provider>), String>> = JoinSet::new();

    for provider in candidates {
        let client = state.http_client.clone();
        let signing_key = state.signing_key.clone();
        let domain_sep = state.tap_domain_separator;
        let data_service = state.config.tap.data_service_address;
        let req = request.clone();
        let p = provider.clone();

        set.spawn(async move {
            let signed = create_receipt(
                &signing_key,
                domain_sep,
                data_service,
                p.address,
                receipt_value,
                Bytes::default(),
            )
            .map_err(|e| e.to_string())?;

            let receipt_header =
                serde_json::to_string(&signed).map_err(|e| e.to_string())?;

            let url = format!("{}/rpc/{}", p.endpoint, chain_id);
            let start = Instant::now();

            let resp = client
                .post(&url)
                .header("TAP-Receipt", receipt_header)
                .json(&req)
                .send()
                .await
                .map_err(|e| format!("connection failed: {e}"))?;

            let ms = start.elapsed().as_millis() as u64;

            if !resp.status().is_success() {
                p.qos.record_failure();
                return Err(format!("HTTP {}", resp.status()));
            }

            let body = resp
                .json::<JsonRpcResponse>()
                .await
                .map_err(|e| format!("invalid response: {e}"))?;

            p.qos.record_success(ms);
            Ok((body, p))
        });
    }

    while let Some(join_result) = set.join_next().await {
        match join_result {
            Ok(Ok((response, provider))) => {
                set.abort_all();
                return Ok((response, provider));
            }
            Ok(Err(e)) => tracing::debug!(error = %e, "provider attempt failed"),
            Err(e) => tracing::debug!(error = %e, "task panicked"),
        }
    }

    Err(GatewayError::AllProvidersFailed(chain_id))
}

// ---------------------------------------------------------------------------
// CU weights
// ---------------------------------------------------------------------------

fn cu_weight_for(method: &str) -> u32 {
    match method {
        "eth_chainId" | "net_version" | "eth_blockNumber" => 1,
        "eth_getBalance" | "eth_getTransactionCount" | "eth_getCode" | "eth_getStorageAt"
        | "eth_sendRawTransaction" | "eth_getBlockByHash" | "eth_getBlockByNumber" => 5,
        "eth_call" | "eth_estimateGas" | "eth_getTransactionReceipt"
        | "eth_getTransactionByHash" => 10,
        "eth_getLogs" => 20,
        _ => 10,
    }
}
