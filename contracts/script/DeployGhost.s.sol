// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {HagiGhost, IHagiVaultShield} from "../src/HagiGhost.sol";

/// @notice Deploys the Ghost Address factory next to an existing vault. Nothing in the vault changes:
///         a claim is an ordinary shield made on the owner's behalf.
///         Reads HAGI_VAULT, and optionally HAGI_GHOST_FEE_BPS (default 50 = 0.5%) and HAGI_GHOST_FEE_TO
///         (default: the deployer, until the $HAGI buy-and-burn contract exists).
contract DeployGhost is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address vault = vm.envAddress("HAGI_VAULT");
        uint256 feeBps = vm.envOr("HAGI_GHOST_FEE_BPS", uint256(50));
        address feeTo = vm.envOr("HAGI_GHOST_FEE_TO", deployer);

        vm.startBroadcast(pk);
        HagiGhost ghost = new HagiGhost(IHagiVaultShield(vault), deployer, feeBps, feeTo);
        vm.stopBroadcast();

        console.log("DEPLOYED ghost", address(ghost));
        console.logBytes32(ghost.walletCodeHash());
        console.log("DEPLOYED block", block.number);
    }
}
