// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {HagiVault, IVerifier, ISwapAdapter} from "../src/HagiVault.sol";
import {BasketRegistry} from "../src/BasketRegistry.sol";

contract Tok is ERC20 {
    constructor(string memory s) ERC20(s, s) {}
    function mint(address to, uint256 a) external { _mint(to, a); }
    function decimals() public pure override returns (uint8) { return 6; }
}

/// Accepts every proof, so these tests exercise the vault's guards and accounting, not the circuit.
contract YesVerifier is IVerifier {
    function verifyProof(uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata, uint256[8] calldata) external pure returns (bool) { return true; }
}

/// Swaps 1:1 by paying out from its own balance.
contract OneToOne is ISwapAdapter {
    function swap(address, address tokenOut, uint256 amountIn, uint256) external returns (uint256) {
        IERC20(tokenOut).transfer(msg.sender, amountIn);
        return amountIn;
    }
}

contract HagiVaultGuardsTest is Test {
    address owner = address(0xA11CE);
    address alice = address(0xA);
    address bob = address(0xB);
    address relayer = address(0xFEE);
    Tok usdg;
    Tok tsla;
    HagiVault vault;
    OneToOne adapter;
    uint256 nonce;

    function setUp() public {
        usdg = new Tok("USDG");
        tsla = new Tok("TSLA");
        vault = new HagiVault(new YesVerifier(), BasketRegistry(address(0)), owner);
        adapter = new OneToOne();
        tsla.mint(address(adapter), 1_000_000e6);
        usdg.mint(address(adapter), 1_000_000e6);
        vm.startPrank(owner);
        vault.setTokenAllowed(address(usdg), true);
        vault.setTokenAllowed(address(tsla), true);
        vault.setAdapter(adapter);
        vault.setShieldLimit(address(usdg), 100e6, 250e6); // $100 an address, $250 in total
        vm.stopPrank();
        for (uint160 i = 0xA; i <= 0xE; ++i) {
            usdg.mint(address(i), 1_000e6);
            vm.prank(address(i));
            usdg.approve(address(vault), type(uint256).max);
        }
        tsla.mint(alice, 10e6);
        vm.prank(alice);
        tsla.approve(address(vault), type(uint256).max);
    }

    function _shield(address who, address token, uint256 amt) internal {
        vm.prank(who);
        vault.shield(token, amt, 1, "");
    }

    function _ext(address token, uint256 amount, address to, uint256 fee) internal view returns (HagiVault.ExtData memory e) {
        e.recipient = to;
        e.token = token;
        e.amount = amount;
        e.relayer = fee == 0 ? address(0) : relayer;
        e.fee = fee;
        e.basketId = type(uint256).max;
        e.legs = new HagiVault.SwapLeg[](0);
    }

    function _proof() internal returns (HagiVault.Proof memory p) {
        p.root = vault.latestRoot();
        p.nullifiers = [++nonce, ++nonce];
        p.commitments = [uint256(1), uint256(2)];
    }

    function _withdraw(address token, uint256 amount, address to, uint256 fee) internal {
        vault.transact(_proof(), _ext(token, amount, to, fee));
    }

    function _swap(address tokenIn, address tokenOut, uint256 amount) internal {
        HagiVault.ExtData memory e = _ext(tokenIn, amount, address(0), 0);
        e.legs = new HagiVault.SwapLeg[](1);
        e.legs[0] = HagiVault.SwapLeg(tokenOut, amount, amount, 1, "");
        vault.transact(_proof(), e);
    }

    // ---------- limits ----------

    function test_per_address_limit() public {
        _shield(alice, address(usdg), 60e6);
        _shield(alice, address(usdg), 40e6);
        vm.expectRevert(abi.encodeWithSelector(HagiVault.OverAddressLimit.selector, 100e6 + 1, 100e6));
        _shield(alice, address(usdg), 1);
    }

    function test_address_limit_is_lifetime_not_balance() public {
        _shield(alice, address(usdg), 100e6);
        _withdraw(address(usdg), 100e6, alice, 0);
        vm.expectRevert(); // withdrawing does not give the address a fresh allowance
        _shield(alice, address(usdg), 1e6);
    }

    function test_total_limit_and_room_freed_by_withdrawals() public {
        _shield(alice, address(usdg), 100e6);
        _shield(bob, address(usdg), 100e6);
        vm.expectRevert(abi.encodeWithSelector(HagiVault.OverTotalLimit.selector, 300e6, 250e6));
        _shield(address(0xC), address(usdg), 100e6);
        _shield(address(0xC), address(usdg), 50e6);
        assertEq(vault.netShielded(address(usdg)), 250e6);
        _withdraw(address(usdg), 80e6, alice, 5e6); // 85 leaves in total
        assertEq(vault.netShielded(address(usdg)), 165e6);
        _shield(address(0xD), address(usdg), 85e6);
        vm.expectRevert();
        _shield(address(0xE), address(usdg), 1);
    }

    function test_net_never_underflows() public {
        _shield(alice, address(usdg), 50e6);
        usdg.mint(address(vault), 500e6); // stands in for USDG that arrived through swaps
        _withdraw(address(usdg), 300e6, alice, 0);
        assertEq(vault.netShielded(address(usdg)), 0);
    }

    function test_token_without_a_limit_cannot_be_shielded_but_can_arrive_by_swap() public {
        vm.expectRevert(abi.encodeWithSelector(HagiVault.OverAddressLimit.selector, 1e6, 0));
        _shield(alice, address(tsla), 1e6);
        _shield(alice, address(usdg), 100e6);
        _swap(address(usdg), address(tsla), 40e6);
        assertEq(tsla.balanceOf(address(vault)), 40e6);
        _withdraw(address(tsla), 40e6, alice, 0);
        assertEq(tsla.balanceOf(alice), 50e6);
    }

    function test_only_owner_sets_guards() public {
        vm.startPrank(alice);
        vm.expectRevert();
        vault.setPaused(true);
        vm.expectRevert();
        vault.setShieldLimit(address(usdg), 1, 1);
        vm.stopPrank();
    }

    function test_owner_can_raise_limits() public {
        _shield(alice, address(usdg), 100e6);
        vm.prank(owner);
        vault.setShieldLimit(address(usdg), 500e6, 50_000e6);
        _shield(alice, address(usdg), 400e6);
    }

    function test_allow_many_tokens_at_once() public {
        address[] memory ts = new address[](3);
        for (uint160 i; i < 3; ++i) ts[i] = address(0x1000 + i);
        vm.prank(alice);
        vm.expectRevert();
        vault.allowTokens(ts);
        vm.prank(owner);
        vault.allowTokens(ts);
        for (uint256 i; i < 3; ++i) {
            assertTrue(vault.allowedToken(ts[i]));
            assertTrue(vault.everAllowed(ts[i]));
        }
    }

    // ---------- pause ----------

    function test_pause_blocks_shield_and_swap_but_never_withdrawals() public {
        _shield(alice, address(usdg), 100e6);
        _swap(address(usdg), address(tsla), 30e6);
        vm.prank(owner);
        vault.setPaused(true);

        vm.expectRevert(HagiVault.Paused.selector);
        _shield(bob, address(usdg), 10e6);

        HagiVault.ExtData memory e = _ext(address(usdg), 10e6, address(0), 0);
        e.legs = new HagiVault.SwapLeg[](1);
        e.legs[0] = HagiVault.SwapLeg(address(tsla), 10e6, 10e6, 1, "");
        HagiVault.Proof memory p = _proof();
        vm.expectRevert(HagiVault.Paused.selector);
        vault.transact(p, e);

        _withdraw(address(usdg), 70e6, alice, 0); // out works
        _withdraw(address(tsla), 30e6, alice, 0);
        vault.transact(_proof(), _ext(address(0), 0, address(0), 0)); // private transfer works
        assertEq(usdg.balanceOf(address(vault)), 0);
    }

    // ---------- disallowing a token can't trap funds ----------

    function test_disallowed_token_can_still_be_withdrawn() public {
        _shield(alice, address(usdg), 100e6);
        _swap(address(usdg), address(tsla), 50e6);
        vm.startPrank(owner);
        vault.setTokenAllowed(address(tsla), false);
        vault.setTokenAllowed(address(usdg), false);
        vm.stopPrank();

        _withdraw(address(tsla), 50e6, alice, 0);
        _withdraw(address(usdg), 50e6, alice, 0);

        vm.expectRevert(abi.encodeWithSelector(HagiVault.TokenNotAllowed.selector, address(usdg)));
        _shield(bob, address(usdg), 1e6);
    }

    function test_disallowed_token_cannot_be_swapped_from_or_into() public {
        _shield(alice, address(usdg), 100e6);
        vm.prank(owner);
        vault.setTokenAllowed(address(tsla), false);
        HagiVault.ExtData memory e = _ext(address(usdg), 10e6, address(0), 0);
        e.legs = new HagiVault.SwapLeg[](1);
        e.legs[0] = HagiVault.SwapLeg(address(tsla), 10e6, 10e6, 1, "");
        HagiVault.Proof memory p = _proof();
        vm.expectRevert(abi.encodeWithSelector(HagiVault.TokenNotAllowed.selector, address(tsla)));
        vault.transact(p, e);
    }

    function test_never_allowed_token_cannot_leave() public {
        Tok rogue = new Tok("ROGUE");
        rogue.mint(address(vault), 5e6);
        HagiVault.ExtData memory e = _ext(address(rogue), 5e6, alice, 0);
        HagiVault.Proof memory p = _proof();
        vm.expectRevert(abi.encodeWithSelector(HagiVault.TokenNotAllowed.selector, address(rogue)));
        vault.transact(p, e);
    }
}
