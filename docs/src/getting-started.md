# Getting Started

## Smoke test a live provider

The fastest way to see the network in action. Fires real TAP-signed JSON-RPC requests at the public provider and validates responses.

```bash
# Test the public provider (default: https://rpc.cargopete.com)
cargo run --bin dispatch-smoke

# Test your own provider
DISPATCH_ENDPOINT=http://localhost:8080 cargo run --bin dispatch-smoke
```

Expected output:

```
dispatch-smoke
  endpoint   : https://rpc.cargopete.com
  chain_id   : 42161

  [PASS] GET /health → 200 OK
  [PASS] eth_blockNumber — returns current block [196ms]
  [PASS] eth_chainId — returns 0xa4b1 (42161) [73ms]
  [PASS] eth_getBalance — balance at latest block (Standard) [94ms]
  [PASS] eth_getBalance — historical block (Archive) [649ms]
  [PASS] eth_getLogs — recent block range (Tier 2 quorum) [83ms]

  5 passed, 0 failed
```

---

## Run the local demo

Runs a complete local stack on Anvil — Horizon contracts, dispatch-service, dispatch-gateway — makes 5 RPC requests, submits a RAV, and proves GRT lands in the payment wallet. The full loop in one command.

Requires: [Foundry](https://getfoundry.sh) and Rust stable.

```bash
cd demo
npm install
npm start
```

---

## Build from source

```bash
cargo build
cargo test
```

---

## Docker Compose

The quickest path to a full running stack:

```bash
cp docker/gateway.example.toml docker/gateway.toml
cp docker/config.example.toml  docker/config.toml
cp docker/oracle.example.toml  docker/oracle.toml

# Fill in private keys, provider addresses, backend RPC URLs, and L1 RPC URL
docker compose -f docker/docker-compose.yml up
```

The stack starts `dispatch-service`, `dispatch-gateway`, `dispatch-oracle`, and PostgreSQL.
