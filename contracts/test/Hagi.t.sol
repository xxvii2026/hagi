// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {TestUSDG} from "../src/TestUSDG.sol";
import {HagiSwap} from "../src/HagiSwap.sol";
import {BasketRegistry, IHagiSwapPools} from "../src/BasketRegistry.sol";

contract Stock is ERC20 {
    constructor(string memory s) ERC20(s, s) {}
    function mint(address to, uint256 a) external { _mint(to, a); }
}

contract HagiTest is Test {
    address owner = address(0xA11CE);
    address user = address(0xB0B);
    TestUSDG usdg;
    HagiSwap swap;
    BasketRegistry reg;
    Stock tsla;
    Stock amd;
    Stock unlisted;

    function setUp() public {
        usdg = new TestUSDG(owner);
        swap = new HagiSwap(IERC20(address(usdg)), owner);
        reg = new BasketRegistry(IHagiSwapPools(address(swap)), owner);
        tsla = new Stock("TSLA");
        amd = new Stock("AMD");
        unlisted = new Stock("NOPE");
        _seed(tsla, 4e18, 1_400e6); // 350 USDG each
        _seed(amd, 4e18, 880e6); // 220 USDG each
        vm.prank(owner);
        usdg.mint(user, 1_000e6);
        vm.startPrank(user);
        usdg.approve(address(swap), type(uint256).max);
        tsla.approve(address(swap), type(uint256).max);
        amd.approve(address(swap), type(uint256).max);
        vm.stopPrank();
    }

    function _seed(Stock t, uint256 amt, uint256 q) internal {
        t.mint(owner, amt);
        vm.startPrank(owner);
        usdg.mint(owner, q);
        t.approve(address(swap), amt);
        usdg.approve(address(swap), q);
        swap.addLiquidity(address(t), amt, q);
        vm.stopPrank();
    }

    // ---------- TestUSDG ----------

    function test_faucet_once_per_day() public {
        vm.warp(1_000_000);
        vm.startPrank(address(0xC0FFEE));
        usdg.faucet();
        assertEq(usdg.balanceOf(address(0xC0FFEE)), 5_000e6);
        vm.expectRevert(abi.encodeWithSelector(TestUSDG.FaucetCooldown.selector, 1_000_000 + 1 days));
        usdg.faucet();
        vm.warp(1_000_000 + 1 days);
        usdg.faucet();
        assertEq(usdg.balanceOf(address(0xC0FFEE)), 10_000e6);
        vm.stopPrank();
    }

    function test_only_owner_mints() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        usdg.mint(user, 1);
        assertEq(usdg.decimals(), 6);
    }

    // ---------- HagiSwap ----------

    function test_spot_price() public view {
        assertEq(swap.spotPrice(address(tsla)), 350e6);
        assertEq(swap.spotPrice(address(amd)), 220e6);
        assertEq(swap.listedCount(), 2);
    }

    function test_buy_matches_quote_and_formula() public {
        uint256 q = swap.quoteExactIn(address(usdg), address(tsla), 100e6);
        // (100 * 0.997 * 4) / (1400 + 100 * 0.997) TSLA
        uint256 expected = (uint256(100e6) * 9970 * 4e18) / (uint256(1_400e6) * 10_000 + uint256(100e6) * 9970);
        assertEq(q, expected);
        vm.prank(user);
        uint256 out = swap.swapExactIn(address(usdg), address(tsla), 100e6, q, user);
        assertEq(out, q);
        assertEq(tsla.balanceOf(user), q);
        assertEq(usdg.balanceOf(user), 900e6);
        _assertReservesMatchBalances();
    }

    function test_sell_and_two_hop() public {
        vm.startPrank(user);
        uint256 got = swap.swapExactIn(address(usdg), address(tsla), 200e6, 0, user);
        uint256 q = swap.quoteExactIn(address(tsla), address(amd), got);
        uint256 out = swap.swapExactIn(address(tsla), address(amd), got, q, user);
        vm.stopPrank();
        assertEq(out, q);
        assertEq(amd.balanceOf(user), q);
        assertEq(tsla.balanceOf(user), 0);
        _assertReservesMatchBalances();
        // Round trip through two fees must lose value.
        vm.prank(user);
        uint256 back = swap.swapExactIn(address(amd), address(usdg), out, 0, user);
        assertLt(back, 200e6);
    }

    function test_reverts() public {
        vm.startPrank(user);
        vm.expectRevert(HagiSwap.ZeroAmount.selector);
        swap.swapExactIn(address(usdg), address(tsla), 0, 0, user);
        vm.expectRevert(HagiSwap.SameToken.selector);
        swap.swapExactIn(address(tsla), address(tsla), 1, 0, user);
        vm.expectRevert(abi.encodeWithSelector(HagiSwap.NoPool.selector, address(unlisted)));
        swap.swapExactIn(address(usdg), address(unlisted), 1e6, 0, user);
        uint256 q = swap.quoteExactIn(address(usdg), address(tsla), 100e6);
        vm.expectRevert(abi.encodeWithSelector(HagiSwap.InsufficientOutput.selector, q, q + 1));
        swap.swapExactIn(address(usdg), address(tsla), 100e6, q + 1, user);
        vm.stopPrank();
        // A failed swap moves nothing.
        assertEq(usdg.balanceOf(user), 1_000e6);
    }

    function test_only_owner_manages_liquidity() public {
        vm.startPrank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        swap.addLiquidity(address(tsla), 1, 1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        swap.removeLiquidity(address(tsla), 1, 1, user);
        vm.stopPrank();
        vm.prank(owner);
        swap.removeLiquidity(address(tsla), 1e18, 350e6, owner);
        assertEq(tsla.balanceOf(owner), 1e18);
        _assertReservesMatchBalances();
    }

    function test_pool_can_never_be_drained_by_a_buy() public {
        vm.prank(owner);
        usdg.mint(user, 10_000_000e6);
        vm.prank(user);
        uint256 out = swap.swapExactIn(address(usdg), address(tsla), 10_000_000e6, 0, user);
        assertLt(out, 4e18);
        _assertReservesMatchBalances();
    }

    function testFuzz_k_never_decreases(uint96 amountIn, bool buy) public {
        (uint128 rt0, uint128 rq0) = swap.pools(address(tsla));
        uint256 k0 = uint256(rt0) * rq0;
        if (buy) {
            amountIn = uint96(bound(amountIn, 1, 1_000_000e6));
            vm.prank(owner);
            usdg.mint(user, amountIn);
            vm.prank(user);
            swap.swapExactIn(address(usdg), address(tsla), amountIn, 0, user);
        } else {
            amountIn = uint96(bound(amountIn, 1, 1_000e18));
            tsla.mint(user, amountIn);
            vm.prank(user);
            swap.swapExactIn(address(tsla), address(usdg), amountIn, 0, user);
        }
        (uint128 rt1, uint128 rq1) = swap.pools(address(tsla));
        assertGe(uint256(rt1) * rq1, k0);
        _assertReservesMatchBalances();
    }

    function _assertReservesMatchBalances() internal view {
        (uint128 rt, uint128 rq) = swap.pools(address(tsla));
        (uint128 ra, uint128 rqa) = swap.pools(address(amd));
        assertEq(tsla.balanceOf(address(swap)), rt);
        assertEq(amd.balanceOf(address(swap)), ra);
        assertEq(usdg.balanceOf(address(swap)), uint256(rq) + rqa);
    }

    // ---------- BasketRegistry ----------

    function _pair() internal view returns (address[] memory t, uint16[] memory w) {
        t = new address[](2);
        w = new uint16[](2);
        t[0] = address(tsla);
        t[1] = address(amd);
        w[0] = 6_000;
        w[1] = 4_000;
    }

    function test_anyone_can_create_a_basket() public {
        (address[] memory t, uint16[] memory w) = _pair();
        vm.prank(user);
        uint256 id = reg.createBasket("EV and chips", t, w);
        assertEq(id, 0);
        BasketRegistry.Basket memory b = reg.getBasket(0);
        assertEq(b.creator, user);
        assertEq(b.name, "EV and chips");
        assertEq(b.tokens.length, 2);
        assertEq(b.weights[0], 6_000);
        assertEq(b.buyers, 0);
        assertEq(reg.basketCount(), 1);
        // Same name again is allowed and gets a new id.
        assertEq(reg.createBasket("EV and chips", t, w), 1);
    }

    function test_basket_rules() public {
        (address[] memory t, uint16[] memory w) = _pair();

        vm.expectRevert(BasketRegistry.BadName.selector);
        reg.createBasket("x", t, w);
        vm.expectRevert(BasketRegistry.BadName.selector);
        reg.createBasket("this name is far too long for a basket", t, w);

        w[1] = 3_999;
        vm.expectRevert(abi.encodeWithSelector(BasketRegistry.WeightsMustTotal10000.selector, 9_999));
        reg.createBasket("ok", t, w);

        w[0] = 10_000;
        w[1] = 0;
        vm.expectRevert(BasketRegistry.ZeroWeight.selector);
        reg.createBasket("ok", t, w);

        w[0] = 6_000;
        w[1] = 4_000;
        t[1] = address(tsla);
        vm.expectRevert(abi.encodeWithSelector(BasketRegistry.DuplicateToken.selector, address(tsla)));
        reg.createBasket("ok", t, w);

        t[1] = address(unlisted);
        vm.expectRevert(abi.encodeWithSelector(BasketRegistry.TokenNotListed.selector, address(unlisted)));
        reg.createBasket("ok", t, w);

        t[1] = address(usdg);
        vm.expectRevert(abi.encodeWithSelector(BasketRegistry.TokenNotListed.selector, address(usdg)));
        reg.createBasket("ok", t, w);

        address[] memory one = new address[](1);
        uint16[] memory oneW = new uint16[](1);
        one[0] = address(tsla);
        oneW[0] = 10_000;
        vm.expectRevert(BasketRegistry.BadLength.selector);
        reg.createBasket("ok", one, oneW);

        address[] memory nine = new address[](9);
        uint16[] memory nineW = new uint16[](9);
        vm.expectRevert(BasketRegistry.BadLength.selector);
        reg.createBasket("ok", nine, nineW);
    }

    function test_recorder_is_set_once_and_gates_buys() public {
        (address[] memory t, uint16[] memory w) = _pair();
        reg.createBasket("ok", t, w);
        vm.expectRevert(BasketRegistry.NotRecorder.selector);
        reg.recordBuy(0);
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        reg.setRecorder(user);
        vm.startPrank(owner);
        reg.setRecorder(address(0xADA));
        vm.expectRevert(BasketRegistry.RecorderAlreadySet.selector);
        reg.setRecorder(address(0xBEEF));
        vm.stopPrank();
        vm.startPrank(address(0xADA));
        reg.recordBuy(0);
        reg.recordBuy(0);
        vm.expectRevert(abi.encodeWithSelector(BasketRegistry.NoBasket.selector, 5));
        reg.recordBuy(5);
        vm.stopPrank();
        assertEq(reg.getBasket(0).buyers, 2);
    }

    function test_pagination() public {
        (address[] memory t, uint16[] memory w) = _pair();
        for (uint256 i; i < 5; ++i) reg.createBasket("ok", t, w);
        assertEq(reg.getBaskets(0, 3).length, 3);
        assertEq(reg.getBaskets(3, 10).length, 2);
        assertEq(reg.getBaskets(9, 10).length, 0);
    }
}
