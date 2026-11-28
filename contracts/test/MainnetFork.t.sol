// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {HagiVault, IVerifier} from "../src/HagiVault.sol";
import {BasketRegistry} from "../src/BasketRegistry.sol";
import {HagiUniV3Adapter, ISwapRouter02} from "../src/HagiUniV3Adapter.sol";

contract AlwaysYes is IVerifier {
    function verifyProof(uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata, uint256[8] calldata) external pure returns (bool) { return true; }
}

/// Runs against a copy of Robinhood Chain mainnet (set MAINNET_RPC). Uses the real USDG, the real stock
/// tokens and the real Uniswap pools. The proof check is stubbed, so this tests everything around it:
/// can the vault hold real stock tokens, swap them, and pay them out.
contract MainnetForkTest is Test {
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant ROUTER = 0xCaf681a66D020601342297493863E78C959E5cb2;
    address constant TSLA = 0x322F0929c4625eD5bAd873c95208D54E1c003b2d;
    address constant AMZN = 0x12f190a9F9d7D37a250758b26824B97CE941bF54;
    address constant PLTR = 0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A;
    address constant NFLX = 0xE0444EF8BF4eD74f74FD73686e2ddF4C1c5591E8;
    address constant AMD = 0x86923f96303D656E4aa86D9d42D1e57ad2023fdC;
    address constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    // A Uniswap pool that holds plenty of USDG. The test borrows its balance instead of minting.
    address constant USDG_WHALE = 0x52e65B17fB6E5BA00Ed806f37Afcd2DaA50271Ca;

    address owner = address(0xA11CE);
    address user = address(0xB0B);
    HagiVault vault;
    HagiUniV3Adapter adapter;
    uint256 nonce;
    bool on;

    function setUp() public {
        string memory rpc = vm.envOr("MAINNET_RPC", string(""));
        if (bytes(rpc).length == 0) return; // skipped locally
        vm.createSelectFork(rpc);
        on = true;

        vault = new HagiVault(new AlwaysYes(), BasketRegistry(address(0)), owner);
        adapter = new HagiUniV3Adapter(ISwapRouter02(ROUTER), USDG, address(vault), owner);
        vm.startPrank(owner);
        vault.setAdapter(adapter);
        vault.setTokenAllowed(USDG, true);
        vault.setShieldLimit(USDG, 100e6, 10_000e6);
        address[6] memory t = [TSLA, AMZN, PLTR, NFLX, AMD, NVDA];
        uint24[6] memory f = [uint24(3000), 3000, 3000, 3000, 3000, 500];
        for (uint256 i; i < 6; ++i) {
            vault.setTokenAllowed(t[i], true);
            adapter.setFee(t[i], f[i]);
        }
        vm.stopPrank();

        vm.prank(USDG_WHALE);
        IERC20(USDG).transfer(user, 100e6);
        vm.prank(user);
        IERC20(USDG).approve(address(vault), type(uint256).max);
    }

    function _proof() internal returns (HagiVault.Proof memory p) {
        p.root = vault.latestRoot();
        p.nullifiers = [++nonce, ++nonce];
        p.commitments = [uint256(1), uint256(2)];
    }

    function _swap(address a, address b, uint256 amt) internal returns (uint256 got) {
        HagiVault.ExtData memory e;
        e.token = a;
        e.amount = amt;
        e.basketId = type(uint256).max;
        e.legs = new HagiVault.SwapLeg[](1);
        e.legs[0] = HagiVault.SwapLeg(b, amt, 1, 1, "");
        uint256 before = IERC20(b).balanceOf(address(vault));
        vault.transact(_proof(), e);
        got = IERC20(b).balanceOf(address(vault)) - before;
    }

    function _out(address token, uint256 amt, address to) internal {
        HagiVault.ExtData memory e;
        e.recipient = to;
        e.token = token;
        e.amount = amt;
        e.basketId = type(uint256).max;
        e.legs = new HagiVault.SwapLeg[](0);
        vault.transact(_proof(), e);
    }

    function test_fork_shield_swap_every_stock_and_withdraw() public {
        if (!on) return;
        vm.prank(user);
        vault.shield(USDG, 100e6, 1, "");

        address[6] memory t = [TSLA, AMZN, PLTR, NFLX, AMD, NVDA];
        string[6] memory n = ["TSLA", "AMZN", "PLTR", "NFLX", "AMD", "NVDA"];
        for (uint256 i; i < 6; ++i) {
            uint256 got = _swap(USDG, t[i], 10e6);
            assertGt(got, 0);
            uint256 back = _swap(t[i], USDG, got);
            console.log(string.concat(n[i], " for 10 USDG: ", vm.toString(got), ", back to USDG: ", vm.toString(back)));
            assertGt(back, 9.7e6); // a round trip costs two pool fees, well under 3%
        }
    }

    function test_fork_stock_to_stock_and_real_token_leaves_the_vault() public {
        if (!on) return;
        vm.prank(user);
        vault.shield(USDG, 100e6, 1, "");
        uint256 tsla = _swap(USDG, TSLA, 50e6);
        uint256 amzn = _swap(TSLA, AMZN, tsla / 2);
        assertGt(amzn, 0);

        _out(TSLA, tsla - tsla / 2, user);
        _out(AMZN, amzn, user);
        assertEq(IERC20(TSLA).balanceOf(user), tsla - tsla / 2);
        assertEq(IERC20(AMZN).balanceOf(user), amzn);
        assertEq(IERC20(TSLA).balanceOf(address(vault)), 0);
        console.log(string.concat("TSLA out: ", vm.toString(tsla - tsla / 2), ", AMZN out: ", vm.toString(amzn)));
    }

    function test_fork_only_the_vault_can_use_the_adapter() public {
        if (!on) return;
        vm.expectRevert(HagiUniV3Adapter.OnlyVault.selector);
        adapter.swap(USDG, TSLA, 1e6, 0);
    }

    function test_fork_limits_hold_on_real_usdg() public {
        if (!on) return;
        vm.prank(USDG_WHALE);
        IERC20(USDG).transfer(user, 50e6);
        vm.startPrank(user);
        vault.shield(USDG, 100e6, 1, "");
        vm.expectRevert();
        vault.shield(USDG, 1e6, 1, "");
        vm.stopPrank();
    }
}
