# Contract Reference

`RPCDataService` is deployed on Arbitrum One at `0x73846272813065c3e4efdb3fb82e0d128c8c2364`.

It inherits Horizon's `DataService` + `DataServiceFees` + `DataServicePausable` and implements `IDataService`.

---

## Functions

### `register(serviceProvider, data)`

Registers a new provider.

- `data`: `abi.encode(string endpoint, string geoHash, address paymentsDestination)`
- Validates: provision ≥ `minimumProvisionTokens`, thawing period ≥ `minimumThawingPeriod`
- Sets `paymentsDestination[serviceProvider]` (defaults to `serviceProvider` if zero address)
- Emits `ServiceProviderRegistered`

### `setPaymentsDestination(destination)`

Changes the GRT recipient for collected fees. The new address takes effect on the next `collect()` call. Callable by a registered provider or their authorised operator at any time.

### `startService(serviceProvider, data)`

Activates a provider for a specific chain and tier.

- `data`: `abi.encode(uint64 chainId, uint8 tier, string endpoint)`
- Validates: `chainId` in `supportedChains`, provider registered
- Emits `ServiceStarted`

### `stopService(serviceProvider, data)`

Deactivates a provider for a `(chainId, tier)` pair.

### `deregister(serviceProvider, data)`

Removes the provider from the registry. Must stop all active services first.

### `collect(serviceProvider, data)`

Redeems a signed RAV for GRT.

- `data`: `abi.encode(SignedRAV, tokensToCollect)`
- Reverts with `InvalidPaymentType` if `paymentType != QueryFee`
- Calls `GraphTallyCollector.collect()` — verifies EIP-712 signature, tracks cumulative value
- Routes GRT to `paymentsDestination[serviceProvider]`
- Locks `fees × stakeToFeesRatio` via `_createStakeClaim()` (releases after `thawingPeriod`)

### `slash(serviceProvider, data)`

Slashes a provider for a Tier 1 Merkle fraud proof.

- `data`: `abi.encode(Tier1FraudProof)` — block hash, account address, dispute type, claimed value, EIP-1186 proofs, challenger address
- Looks up `trustedStateRoots[blockHash]` (populated by `dispatch-oracle`)
- Verifies proof via `StateProofVerifier.sol`
- Calls `HorizonStaking.slash()` — 50% bounty to challenger

### `proposeChain(chainId, minProvisionTokens)` / `approveProposedChain` / `rejectProposedChain`

Permissionless chain registration. Proposer locks a 100k GRT bond. Governance approves or rejects within a window. Bond returned on approval, burned on rejection.

### `setMinThawingPeriod(period)`

Governance setter. Lower-bounded by `MIN_THAWING_PERIOD` (14 days).

### `claimRewards()`

Transfers accrued GRT issuance rewards to the caller. Rewards accrue on each `collect()` call when the rewards pool is funded.

---

## Parameters

| Parameter | Value | Notes |
|---|---|---|
| Minimum provision | 25,000 GRT | Governance-adjustable per chain |
| Minimum thawing period | 14 days | Governance-adjustable, lower-bounded |
| stakeToFeesRatio | 5 | Same as SubgraphService |
| Max slash % | 10% | Tier 1 fraud proofs only |
| Chain proposal bond | 100,000 GRT | Burned on rejection |

---

## StateProofVerifier

`contracts/src/lib/StateProofVerifier.sol` — EIP-1186 Merkle-Patricia trie verification using OpenZeppelin's MPT library.

```solidity
function verifyAccount(
    bytes32 stateRoot,
    address account,
    bytes[] calldata accountProof
) external pure returns (AccountFields memory);

function verifyStorage(
    bytes32 storageHash,
    bytes32 storageKey,
    bytes[] calldata storageProof
) external pure returns (bytes32 value);
```

Used by `slash()` to verify on-chain that a provider's attested response is inconsistent with the Ethereum state trie.
