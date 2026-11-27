// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {HagiNames} from "../src/HagiNames.sol";

/// @notice Deploys the name.hagi registry and reserves brand and team names.
contract DeployNames is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        string[] memory r = new string[](40);
        string[40] memory list = [
            "hagi", "hagitrade", "admin", "support", "team", "official", "help", "vault", "relayer", "ghost",
            "robinhood", "pons", "fomo", "tesla", "amazon", "netflix", "palantir", "nvidia", "apple", "google",
            "microsoft", "meta", "binance", "coinbase", "ethereum", "bitcoin", "usdg", "paxos", "elon", "vlad",
            "dexscreener", "uniswap", "metamask", "phantom", "rabby", "hagidev", "hagiteam", "hagiapp", "security", "moderator"
        ];
        for (uint256 i; i < 40; i++) r[i] = list[i];
        vm.startBroadcast(pk);
        HagiNames names = new HagiNames(deployer);
        names.setReserved(r, true);
        vm.stopBroadcast();
        console.log("DEPLOYED names", address(names));
        console.log("DEPLOYED block", block.number);
    }
}
