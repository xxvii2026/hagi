// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TestUSDG} from "../src/TestUSDG.sol";
import {HagiSwap} from "../src/HagiSwap.sol";
import {MockStock} from "./mocks/MockStock.sol";

/// @notice Local chain only. Stands up what already exists on testnet: test USDG, five stocks and seeded pools.
contract LocalSetup is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address user = vm.envAddress("TEST_USER");
        string[5] memory symbols = ["TSLA", "AMD", "AMZN", "NFLX", "PLTR"];
        uint256[5] memory prices = [uint256(350), 220, 230, 110, 170];

        vm.startBroadcast(pk);
        TestUSDG usdg = new TestUSDG(deployer);
        HagiSwap swap = new HagiSwap(IERC20(address(usdg)), deployer);
        usdg.approve(address(swap), type(uint256).max);
        usdg.mint(user, 10_000e6);
        console.log("DEPLOYED usdg", address(usdg));
        console.log("DEPLOYED swap", address(swap));
        for (uint256 i; i < 5; ++i) {
            MockStock s = new MockStock(symbols[i]);
            s.mint(deployer, 400e18);
            s.mint(user, 10e18);
            usdg.mint(deployer, 400 * prices[i] * 1e6);
            s.approve(address(swap), 400e18);
            swap.addLiquidity(address(s), 400e18, 400 * prices[i] * 1e6);
            console.log(string.concat("DEPLOYED ", symbols[i]), address(s));
        }
        vm.stopBroadcast();
    }
}
