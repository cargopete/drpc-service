# Configuration

---

## dispatch-service (`config.toml`)

```toml
[server]
host = "0.0.0.0"
port = 7700

[indexer]
service_provider_address = "0x..."    # your provider address
operator_private_key      = "0x..."   # signs response attestations

[tap]
data_service_address      = "0x73846272813065c3e4efdb3fb82e0d128c8c2364"
authorized_senders        = ["0x..."] # gateway signer address(es)
eip712_domain_name        = "TAP"
eip712_chain_id           = 42161
eip712_verifying_contract = "0x8f69F5C07477Ac46FBc491B1E6D91E2bb0111A9e"

[database]
url = "postgres://dispatch:dispatch@localhost/dispatch"

[chains]
supported = [1, 42161, 10, 8453]

[chains.backends]
"1"     = "http://localhost:8545"
"42161" = "http://localhost:8546"
"10"    = "http://localhost:8547"
"8453"  = "http://localhost:8548"
```

---

## dispatch-gateway (`gateway.toml`)

```toml
[gateway]
host   = "0.0.0.0"
port   = 8080
region = "eu-west"   # optional — used for geographic routing bonus

[tap]
signer_private_key        = "0x..."   # signs TAP receipts
data_service_address      = "0x73846272813065c3e4efdb3fb82e0d128c8c2364"
base_price_per_cu         = 4000000000000   # GRT wei per CU (~$40/M requests at $0.09 GRT)
eip712_domain_name        = "TAP"
eip712_chain_id           = 42161
eip712_verifying_contract = "0x8f69F5C07477Ac46FBc491B1E6D91E2bb0111A9e"

[qos]
probe_interval_secs = 10
concurrent_k        = 3       # dispatch to top-3, return first valid response
region_bonus        = 0.15    # score boost for same-region providers

[rate_limit]
requests_per_second = 100
burst_size          = 200

[discovery]
subgraph_url  = "https://api.studio.thegraph.com/query/1747796/rpc-network/v0.1.1"
interval_secs = 60

# Static providers (optional; used as fallback if subgraph is unavailable)
[[providers]]
address      = "0x..."
endpoint     = "https://rpc.your-indexer.com"
chains       = [1, 42161, 10, 8453]
region       = "eu-west"
capabilities = ["standard", "archive"]
```

---

## dispatch-oracle (`oracle.toml`)

```toml
[oracle]
poll_interval_secs = 12    # approximately one Ethereum block
tx_timeout_secs    = 120

[l1]
rpc_url = "https://eth-mainnet.example.com/YOUR_KEY"

[arbitrum]
rpc_url              = "https://arb1.arbitrum.io/rpc"
signer_private_key   = "0x..."   # RPCDataService owner or authorised caller
data_service_address = "0x73846272813065c3e4efdb3fb82e0d128c8c2364"
```

---

## Environment variables

`dispatch-service` also reads configuration from environment variables (prefixed `DISPATCH_`):

```bash
DISPATCH_CONFIG=/etc/dispatch/config.toml     # path to config file
RUST_LOG=info                                  # log level
```

`dispatch-gateway`:

```bash
DISPATCH_GATEWAY_CONFIG=/etc/dispatch/gateway.toml
```

`dispatch-oracle`:

```bash
DISPATCH_ORACLE_CONFIG=/etc/dispatch/oracle.toml
```
