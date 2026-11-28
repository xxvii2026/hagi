// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {Groth16VerifierMainnet} from "../src/VerifierMainnet.sol";
import {HagiVault, IVerifier, ISwapAdapter} from "../src/HagiVault.sol";
import {HagiUniV3Adapter, ISwapRouter02} from "../src/HagiUniV3Adapter.sol";
import {BasketRegistry} from "../src/BasketRegistry.sol";

/// @notice Deploys the mainnet beta: verifier, vault and the Uniswap v3 adapter, then lists every stock in
///         deployments/mainnet-tokens.json. Core only, so there is no basket registry.
///         Deposits are USDG only and capped: $100 an address and $10,000 in total to start.
contract DeployMainnet is Script {
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant ROUTER = 0xCaf681a66D020601342297493863E78C959E5cb2;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        // mainnet-list.json is the same list as mainnet-tokens.json, as two plain arrays the script can read.
        string memory json = vm.readFile("deployments/mainnet-list.json");
        address[] memory tokens = vm.parseJsonAddressArray(json, ".tokens");
        uint256[] memory rawFees = vm.parseJsonUintArray(json, ".fees");
        require(tokens.length == rawFees.length && tokens.length > 0, "bad token list");
        uint24[] memory fees = new uint24[](rawFees.length);
        for (uint256 i; i < rawFees.length; ++i) fees[i] = uint24(rawFees[i]);

        vm.startBroadcast(pk);
        Groth16VerifierMainnet verifier = new Groth16VerifierMainnet();
        HagiVault vault = new HagiVault(IVerifier(address(verifier)), BasketRegistry(address(0)), deployer);
        HagiUniV3Adapter adapter = new HagiUniV3Adapter(ISwapRouter02(ROUTER), USDG, address(vault), deployer);
        vault.setAdapter(ISwapAdapter(address(adapter)));
        vault.setTokenAllowed(USDG, true);
        vault.setShieldLimit(USDG, uint128(vm.envOr("PER_ADDRESS_USDG", uint256(100)) * 1e6), uint128(vm.envOr("TOTAL_USDG", uint256(10_000)) * 1e6));
        vault.allowTokens(tokens);
        adapter.setFees(tokens, fees);
        vm.stopBroadcast();

        console.log("DEPLOYED verifier", address(verifier));
        console.log("DEPLOYED vault", address(vault));
        console.log("DEPLOYED adapter", address(adapter));
        console.log("DEPLOYED block", block.number);
        console.log("LISTED stocks", tokens.length);
    }
}
