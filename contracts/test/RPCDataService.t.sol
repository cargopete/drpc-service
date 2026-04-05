// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.27;

import {Test, console2} from "forge-std/Test.sol";

import {RPCDataService} from "../src/RPCDataService.sol";
import {IRPCDataService} from "../src/interfaces/IRPCDataService.sol";
import {IHorizonStaking} from "@graphprotocol/horizon/interfaces/IHorizonStaking.sol";
import {IGraphPayments} from "@graphprotocol/horizon/interfaces/IGraphPayments.sol";

/// @dev Minimal mock of IHorizonStaking — only the provision-related methods used by RPCDataService.
contract MockHorizonStaking {
    mapping(address => mapping(address => IHorizonStaking.Provision)) public provisions;

    function setProvision(
        address serviceProvider,
        address dataService,
        uint256 tokens,
        uint64 thawingPeriodMin
    ) external {
        provisions[serviceProvider][dataService] = IHorizonStaking.Provision({
            tokens: tokens,
            tokensThawing: 0,
            createdAt: uint256(block.timestamp),
            maxVerifierCut: 1_000_000, // 100% in PPM
            thawingPeriodMin: thawingPeriodMin,
            verifier: dataService,
            sharesThawing: 0,
            maxVerifierCutPending: 0,
            thawingPeriodMinPending: 0
        });
    }

    function getProvision(address serviceProvider, address dataService)
        external
        view
        returns (IHorizonStaking.Provision memory)
    {
        return provisions[serviceProvider][dataService];
    }

    function isAuthorized(address serviceProvider, address, address operator)
        external
        pure
        returns (bool)
    {
        return serviceProvider == operator;
    }

    function slash(address, uint256, uint256, address) external {}
    function acceptProvisionParameters(address) external {}
}

/// @dev Minimal mock of GraphDirectory that returns mock contract addresses.
contract MockGraphDirectory {
    address public immutable horizonStaking;
    address public immutable graphPayments;

    constructor(address _staking, address _payments) {
        horizonStaking = _staking;
        graphPayments = _payments;
    }

    function graphStaking() external view returns (address) {
        return horizonStaking;
    }
    function graphPayments_() external view returns (address) {
        return graphPayments;
    }
}

contract RPCDataServiceTest is Test {
    RPCDataService public service;
    MockHorizonStaking public staking;

    address public owner = makeAddr("owner");
    address public pauseGuardian = makeAddr("pauseGuardian");
    address public provider = makeAddr("provider");
    address public gateway = makeAddr("gateway");

    uint256 constant SUFFICIENT_PROVISION = 25_000e18;
    uint64 constant SUFFICIENT_THAWING = 14 days;
    uint64 constant CHAIN_ETH_MAINNET = 1;
    uint64 constant CHAIN_ARBITRUM = 42161;

    function setUp() public {
        staking = new MockHorizonStaking();

        // Deploy RPCDataService — in a real test this would use a forked Arbitrum env.
        // For now we deploy with a placeholder controller and override internal calls via mocks.
        vm.prank(owner);
        // NOTE: In a fork test, pass the real GraphDirectory (Controller) address.
        // Here we pass address(0) and override staking calls via vm.mockCall.
        service = new RPCDataService(address(0), pauseGuardian);

        // Mock staking.getProvision to return a valid provision for our test provider
        _mockValidProvision(provider);

        // Mock staking.isAuthorized to allow provider to call on their own behalf
        vm.mockCall(
            address(staking),
            abi.encodeWithSelector(IHorizonStaking.isAuthorized.selector, provider, address(service), provider),
            abi.encode(true)
        );

        // Add supported chains
        vm.startPrank(owner);
        service.addChain(CHAIN_ETH_MAINNET, 0);
        service.addChain(CHAIN_ARBITRUM, 0);
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // Chain governance
    // -------------------------------------------------------------------------

    function test_addChain_setsDefaultMinProvision() public view {
        (bool enabled, uint256 minTokens) = _getChainConfig(CHAIN_ETH_MAINNET);
        assertTrue(enabled);
        assertEq(minTokens, RPCDataService(address(service)).DEFAULT_MIN_PROVISION());
    }

    function test_addChain_customMinProvision() public {
        uint256 customMin = 10_000e18;
        vm.prank(owner);
        service.addChain(999, customMin);

        (bool enabled, uint256 minTokens) = _getChainConfig(999);
        assertTrue(enabled);
        assertEq(minTokens, customMin);
    }

    function test_removeChain_disablesChain() public {
        vm.prank(owner);
        service.removeChain(CHAIN_ETH_MAINNET);

        (bool enabled,) = _getChainConfig(CHAIN_ETH_MAINNET);
        assertFalse(enabled);
    }

    function test_addChain_revertIfNotOwner() public {
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(); // Ownable: caller is not the owner
        service.addChain(1, 0);
    }

    // -------------------------------------------------------------------------
    // Provider registration
    // -------------------------------------------------------------------------

    function test_register_succeeds() public {
        _register(provider, "https://rpc.example.com", "u1hx");
        assertTrue(service.isRegistered(provider));
    }

    function test_register_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit IRPCDataService.ProviderRegistered(provider, "https://rpc.example.com", "u1hx");
        _register(provider, "https://rpc.example.com", "u1hx");
    }

    function test_register_revertIfAlreadyRegistered() public {
        _register(provider, "https://rpc.example.com", "u1hx");
        vm.expectRevert(
            abi.encodeWithSelector(IRPCDataService.ProviderAlreadyRegistered.selector, provider)
        );
        _register(provider, "https://rpc.example.com", "u1hx");
    }

    function test_register_revertIfInsufficientProvision() public {
        address poorProvider = makeAddr("poorProvider");
        _mockProvision(poorProvider, SUFFICIENT_PROVISION - 1, SUFFICIENT_THAWING);

        vm.prank(poorProvider);
        vm.expectRevert(
            abi.encodeWithSelector(
                IRPCDataService.InsufficientProvision.selector,
                RPCDataService(address(service)).DEFAULT_MIN_PROVISION(),
                SUFFICIENT_PROVISION - 1
            )
        );
        service.register(
            poorProvider, abi.encode("https://rpc.example.com", "u1hx")
        );
    }

    function test_register_revertIfThawingPeriodTooShort() public {
        address shortProvider = makeAddr("shortProvider");
        _mockProvision(shortProvider, SUFFICIENT_PROVISION, SUFFICIENT_THAWING - 1);

        vm.prank(shortProvider);
        vm.expectRevert(
            abi.encodeWithSelector(
                IRPCDataService.ThawingPeriodTooShort.selector,
                RPCDataService(address(service)).MIN_THAWING_PERIOD(),
                SUFFICIENT_THAWING - 1
            )
        );
        service.register(shortProvider, abi.encode("https://rpc.example.com", "u1hx"));
    }

    // -------------------------------------------------------------------------
    // Service start / stop
    // -------------------------------------------------------------------------

    function test_startService_succeeds() public {
        _register(provider, "https://rpc.example.com", "u1hx");
        _startService(provider, CHAIN_ETH_MAINNET, IRPCDataService.CapabilityTier.Standard, "https://rpc.example.com");

        IRPCDataService.ChainRegistration[] memory regs = service.getChainRegistrations(provider);
        assertEq(regs.length, 1);
        assertEq(regs[0].chainId, CHAIN_ETH_MAINNET);
        assertTrue(regs[0].active);
    }

    function test_startService_revertIfChainNotSupported() public {
        _register(provider, "https://rpc.example.com", "u1hx");

        vm.prank(provider);
        vm.expectRevert(
            abi.encodeWithSelector(IRPCDataService.ChainNotSupported.selector, uint256(999))
        );
        service.startService(
            provider,
            abi.encode(uint64(999), uint8(IRPCDataService.CapabilityTier.Standard), "https://rpc.example.com")
        );
    }

    function test_startService_revertIfNotRegistered() public {
        vm.prank(provider);
        vm.expectRevert(
            abi.encodeWithSelector(IRPCDataService.ProviderNotRegistered.selector, provider)
        );
        service.startService(
            provider,
            abi.encode(CHAIN_ETH_MAINNET, uint8(IRPCDataService.CapabilityTier.Standard), "https://rpc.example.com")
        );
    }

    function test_stopService_deactivatesRegistration() public {
        _register(provider, "https://rpc.example.com", "u1hx");
        _startService(provider, CHAIN_ETH_MAINNET, IRPCDataService.CapabilityTier.Standard, "https://rpc.example.com");

        vm.prank(provider);
        service.stopService(
            provider,
            abi.encode(CHAIN_ETH_MAINNET, uint8(IRPCDataService.CapabilityTier.Standard))
        );

        IRPCDataService.ChainRegistration[] memory regs = service.getChainRegistrations(provider);
        assertFalse(regs[0].active);
        assertEq(service.activeRegistrationCount(provider), 0);
    }

    function test_stopService_revertIfNotFound() public {
        _register(provider, "https://rpc.example.com", "u1hx");

        vm.prank(provider);
        vm.expectRevert(
            abi.encodeWithSelector(
                IRPCDataService.RegistrationNotFound.selector,
                provider,
                CHAIN_ETH_MAINNET,
                IRPCDataService.CapabilityTier.Standard
            )
        );
        service.stopService(
            provider,
            abi.encode(CHAIN_ETH_MAINNET, uint8(IRPCDataService.CapabilityTier.Standard))
        );
    }

    function test_deregister_revertIfActiveRegistrationsExist() public {
        _register(provider, "https://rpc.example.com", "u1hx");
        _startService(provider, CHAIN_ETH_MAINNET, IRPCDataService.CapabilityTier.Standard, "https://rpc.example.com");

        vm.prank(provider);
        vm.expectRevert(
            abi.encodeWithSelector(IRPCDataService.ActiveRegistrationsExist.selector, provider)
        );
        service.deregister(provider, "");
    }

    // -------------------------------------------------------------------------
    // Pause guardian
    // -------------------------------------------------------------------------

    function test_pause_blocksRegister() public {
        vm.prank(pauseGuardian);
        service.pause();

        vm.prank(provider);
        vm.expectRevert(); // Pausable: paused
        service.register(provider, abi.encode("https://rpc.example.com", "u1hx"));
    }

    function test_unpause_allowsRegister() public {
        vm.prank(pauseGuardian);
        service.pause();
        vm.prank(pauseGuardian);
        service.unpause();

        _register(provider, "https://rpc.example.com", "u1hx");
        assertTrue(service.isRegistered(provider));
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function _register(address _provider, string memory endpoint, string memory geo) internal {
        vm.prank(_provider);
        service.register(_provider, abi.encode(endpoint, geo));
    }

    function _startService(
        address _provider,
        uint64 chainId,
        IRPCDataService.CapabilityTier tier,
        string memory endpoint
    ) internal {
        vm.prank(_provider);
        service.startService(_provider, abi.encode(chainId, uint8(tier), endpoint));
    }

    function _mockValidProvision(address _provider) internal {
        _mockProvision(_provider, SUFFICIENT_PROVISION, SUFFICIENT_THAWING);
    }

    function _mockProvision(address _provider, uint256 tokens, uint64 thawingPeriod) internal {
        // Mock _graphStaking().getProvision() — DataService calls this via GraphDirectory.
        // In a fork test, this would be replaced with real HorizonStaking calls.
        vm.mockCall(
            address(0), // TODO: replace with real HorizonStaking address in fork tests
            abi.encodeWithSelector(
                IHorizonStaking.getProvision.selector, _provider, address(service)
            ),
            abi.encode(
                IHorizonStaking.Provision({
                    tokens: tokens,
                    tokensThawing: 0,
                    createdAt: block.timestamp,
                    maxVerifierCut: 1_000_000,
                    thawingPeriodMin: thawingPeriod,
                    verifier: address(service),
                    sharesThawing: 0,
                    maxVerifierCutPending: 0,
                    thawingPeriodMinPending: 0
                })
            )
        );
    }

    function _getChainConfig(uint256 chainId)
        internal
        view
        returns (bool enabled, uint256 minTokens)
    {
        IRPCDataService.ChainConfig memory cfg = service.supportedChains(chainId);
        return (cfg.enabled, cfg.minProvisionTokens);
    }
}
