# RPCDataService — Solidity

## Setup

```bash
# Install Foundry (if needed)
curl -L https://foundry.paradigm.xyz | bash && foundryup

# Install dependencies
forge install graphprotocol/contracts
forge install OpenZeppelin/openzeppelin-contracts
forge install OpenZeppelin/openzeppelin-contracts-upgradeable

# Build
forge build

# Test (unit tests with mocks)
forge test -vvv

# Fork tests against Arbitrum Sepolia
forge test --fork-url $ARBITRUM_SEPOLIA_RPC_URL -vvv
```

## Deployment

```bash
cp .env.example .env
# fill in PRIVATE_KEY, GRAPH_CONTROLLER, PAUSE_GUARDIAN

# Arbitrum Sepolia (testnet)
forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia --broadcast --verify -vvvv
```

## Key parameters

| Parameter | Value |
|---|---|
| Minimum provision | 25,000 GRT per chain |
| Thawing period | 14 days |
| stakeToFeesRatio | 5 (5:1) |
| Network | Arbitrum One (chain ID 42161) |
