// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IHagiVaultShield} from "../src/HagiGhost.sol";
import {HagiGhostSwap, IHagiSwapExact} from "../src/HagiGhostSwap.sol";

/// @notice Deploys the Ghost Swap factory next to the live vault and pools. Nothing else changes.
///         Reads HAGI_VAULT, HAGI_SWAP, HAGI_RELAYER (the only address allowed to swap on claim), and optionally
///         HAGI_GHOST_FEE_BPS (default 50 = 0.5%) and HAGI_GHOST_FEE_TO (default: the deployer).
contract DeployGhostSwap is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        vm.startBroadcast(pk);
        HagiGhostSwap gs = new HagiGhostSwap(
            IHagiVaultShield(vm.envAddress("HAGI_VAULT")),
            IHagiSwapExact(vm.envAddress("HAGI_SWAP")),
            deployer,
            vm.envOr("HAGI_GHOST_FEE_BPS", uint256(50)),
            vm.envOr("HAGI_GHOST_FEE_TO", deployer),
            vm.envAddress("HAGI_RELAYER")
        );
        vm.stopBroadcast();
        console.log("DEPLOYED ghostswap", address(gs));
        console.log("DEPLOYED block", block.number);
    }
}
