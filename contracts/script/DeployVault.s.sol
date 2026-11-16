// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {Groth16Verifier} from "../src/Verifier.sol";
import {HagiSwap} from "../src/HagiSwap.sol";
import {HagiVault, IVerifier, ISwapAdapter} from "../src/HagiVault.sol";
import {HagiSwapAdapter} from "../src/HagiSwapAdapter.sol";
import {BasketRegistry, IHagiSwapPools} from "../src/BasketRegistry.sol";

/// @notice Deploys the vault, its verifier, the swap adapter and a basket registry wired to the vault.
///         Reads the existing test USDG, pools and stock tokens from the environment:
///         HAGI_USDG, HAGI_SWAP and HAGI_TOKENS (comma separated, in the order TSLA, AMD, AMZN, NFLX, PLTR).
contract DeployVault is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address usdg = vm.envAddress("HAGI_USDG");
        HagiSwap swap = HagiSwap(vm.envAddress("HAGI_SWAP"));
        address[] memory tokens = vm.envAddress("HAGI_TOKENS", ",");

        vm.startBroadcast(pk);
        Groth16Verifier verifier = new Groth16Verifier();
        BasketRegistry registry = new BasketRegistry(IHagiSwapPools(address(swap)), deployer);
        HagiVault vault = new HagiVault(IVerifier(address(verifier)), registry, deployer);
        HagiSwapAdapter adapter = new HagiSwapAdapter(swap, address(vault));

        vault.setAdapter(ISwapAdapter(address(adapter)));
        vault.setTokenAllowed(usdg, true);
        for (uint256 i; i < tokens.length; ++i) {
            vault.setTokenAllowed(tokens[i], true);
        }
        registry.setRecorder(address(vault));

        if (tokens.length == 5) {
            uint16[] memory even = new uint16[](5);
            for (uint256 i; i < 5; ++i) even[i] = 2000;
            registry.createBasket("All five", tokens, even);
            registry.createBasket("Chips and data", _two(tokens[1], tokens[4]), _w(6000, 4000));
            registry.createBasket("Screens and carts", _two(tokens[3], tokens[2]), _w(5000, 5000));
        }
        vm.stopBroadcast();

        console.log("DEPLOYED verifier", address(verifier));
        console.log("DEPLOYED registry", address(registry));
        console.log("DEPLOYED vault", address(vault));
        console.log("DEPLOYED adapter", address(adapter));
        console.log("DEPLOYED block", block.number);
    }

    function _two(address a, address b) private pure returns (address[] memory x) {
        x = new address[](2);
        (x[0], x[1]) = (a, b);
    }

    function _w(uint16 a, uint16 b) private pure returns (uint16[] memory x) {
        x = new uint16[](2);
        (x[0], x[1]) = (a, b);
    }
}
