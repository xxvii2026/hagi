// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TestUSDG} from "../src/TestUSDG.sol";
import {HagiSwap} from "../src/HagiSwap.sol";
import {BasketRegistry, IHagiSwapPools} from "../src/BasketRegistry.sol";

/// @notice Deploys the test dollar, the pools and the basket registry to Robinhood Chain Testnet,
///         seeds one pool per stock token from the deployer's balance and publishes starter baskets.
contract Deploy is Script {
    // The stock tokens handed out by the Robinhood Chain Testnet faucet.
    address constant TSLA = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;
    address constant AMD = 0x71178BAc73cBeb415514eB542a8995b82669778d;
    address constant AMZN = 0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02;
    address constant NFLX = 0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93;
    address constant PLTR = 0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0;

    uint256 constant KEEP_BACK = 1e18; // left in the deployer for testing
    uint256 constant MAX_SEED = 4e18;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        require(block.chainid == 46630, "not Robinhood Chain Testnet");

        // Rough starting prices in whole dollars. They only set where each pool opens.
        address[5] memory tokens = [TSLA, AMD, AMZN, NFLX, PLTR];
        uint256[5] memory prices = [uint256(350), 220, 230, 110, 170];

        vm.startBroadcast(pk);
        TestUSDG usdg = new TestUSDG(deployer);
        HagiSwap swap = new HagiSwap(IERC20(address(usdg)), deployer);
        BasketRegistry registry = new BasketRegistry(IHagiSwapPools(address(swap)), deployer);

        usdg.approve(address(swap), type(uint256).max);
        for (uint256 i; i < tokens.length; ++i) {
            uint256 bal = IERC20(tokens[i]).balanceOf(deployer);
            if (bal <= KEEP_BACK) continue;
            uint256 amt = bal - KEEP_BACK > MAX_SEED ? MAX_SEED : bal - KEEP_BACK;
            uint256 quoteAmt = (amt * prices[i] * 1e6) / 1e18;
            usdg.mint(deployer, quoteAmt);
            IERC20(tokens[i]).approve(address(swap), amt);
            swap.addLiquidity(tokens[i], amt, quoteAmt);
        }

        if (swap.listedCount() == 5) {
            _basket(registry, "All five", _a(TSLA, AMD, AMZN, NFLX, PLTR), _w(2000, 2000, 2000, 2000, 2000));
            _basket(registry, "Chips and data", _a2(AMD, PLTR), _w2(6000, 4000));
            _basket(registry, "Screens and carts", _a2(NFLX, AMZN), _w2(5000, 5000));
        }
        vm.stopBroadcast();

        console.log("DEPLOYED usdg", address(usdg));
        console.log("DEPLOYED swap", address(swap));
        console.log("DEPLOYED registry", address(registry));
        console.log("DEPLOYED pools", swap.listedCount());
        console.log("DEPLOYED baskets", registry.basketCount());
    }

    function _basket(BasketRegistry r, string memory name, address[] memory t, uint16[] memory w) private {
        r.createBasket(name, t, w);
    }

    function _a(address a, address b, address c, address d, address e) private pure returns (address[] memory x) {
        x = new address[](5);
        (x[0], x[1], x[2], x[3], x[4]) = (a, b, c, d, e);
    }

    function _w(uint16 a, uint16 b, uint16 c, uint16 d, uint16 e) private pure returns (uint16[] memory x) {
        x = new uint16[](5);
        (x[0], x[1], x[2], x[3], x[4]) = (a, b, c, d, e);
    }

    function _a2(address a, address b) private pure returns (address[] memory x) {
        x = new address[](2);
        (x[0], x[1]) = (a, b);
    }

    function _w2(uint16 a, uint16 b) private pure returns (uint16[] memory x) {
        x = new uint16[](2);
        (x[0], x[1]) = (a, b);
    }
}
