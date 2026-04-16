# Using the Network

Two ways to consume the Dispatch network: the consumer SDK (trustless, signs receipts locally) or the gateway (managed, handles everything centrally).

---

## Consumer SDK

The `@dispatch/consumer-sdk` package is for dApp developers who want direct, trustless access to providers without running a gateway.

```bash
npm install @dispatch/consumer-sdk
```

```typescript
import { DISPATCHClient } from "@dispatch/consumer-sdk";

const client = new DISPATCHClient({
  chainId: 1,
  dataServiceAddress: "0x73846272813065c3e4efdb3fb82e0d128c8c2364",
  graphTallyCollector: "0x8f69F5C07477Ac46FBc491B1E6D91E2bb0111A9e",
  subgraphUrl: "https://api.studio.thegraph.com/query/1747796/rpc-network/v0.1.1",
  signerPrivateKey: process.env.CONSUMER_KEY as `0x${string}`,
  basePricePerCU: 4_000_000_000_000n,  // GRT wei per compute unit
});

// Standard JSON-RPC calls
const blockNumber = await client.request("eth_blockNumber", []);
const balance = await client.request("eth_getBalance", ["0x...", "latest"]);
```

The client handles everything: discovers providers via the subgraph, selects one by QoS score, signs a TAP receipt per request, and updates scores after each response.

### Low-level utilities

```typescript
import {
  signReceipt,
  buildReceipt,
  discoverProviders,
  selectProvider,
  computeAttestationHash,
  recoverAttestationSigner,
} from "@dispatch/consumer-sdk";

// Discover active providers for a chain + tier
const providers = await discoverProviders({
  subgraphUrl: "...",
  chainId: 42161,
  tier: 0,  // Standard
});

// Select one by QoS score (weighted random)
const provider = selectProvider(providers);

// Build and sign a receipt manually
const receipt = buildReceipt({
  dataService: "0x73846272...",
  serviceProvider: provider.address,
  value: 4_000_000_000_000n,
});
const signed = await signReceipt(receipt, privateKey);

// Verify a provider's response attestation
const hash = computeAttestationHash({
  chainId: 42161,
  method: "eth_getBalance",
  params: ["0x...", "latest"],
  response: "0x...",
  blockNumber: 12345678n,
  blockHash: "0x...",
});
const signer = recoverAttestationSigner(hash, attestationSignature);
```

---

## Via the Gateway

The gateway signs receipts on your behalf and handles provider selection. It exposes a standard JSON-RPC interface.

```bash
# Single chain via path
POST http://gateway-host:8080/rpc/1          # Ethereum mainnet
POST http://gateway-host:8080/rpc/42161      # Arbitrum One

# Chain selection via header
POST http://gateway-host:8080/rpc
X-Chain-Id: 42161
```

You can point any standard Ethereum library (ethers.js, viem, web3.py) at the gateway URL with no other changes.

---

## Funding the escrow

Before any GRT flows to providers, a consumer needs to deposit into `PaymentsEscrow` on Arbitrum One:

```solidity
// 1. Approve the escrow contract
GRT.approve(PaymentsEscrow, amount);

// 2. Deposit for a specific provider
PaymentsEscrow.deposit(providerAddress, amount);
```

The gateway signer address is what you deposit for. The TAP agent then draws down automatically on each `collect()` cycle.
