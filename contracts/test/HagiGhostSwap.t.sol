// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoseidonT4} from "poseidon-solidity/PoseidonT4.sol";
import {HagiVault, IVerifier} from "../src/HagiVault.sol";
import {BasketRegistry} from "../src/BasketRegistry.sol";
import {HagiSwap} from "../src/HagiSwap.sol";
import {TestUSDG} from "../src/TestUSDG.sol";
import {GhostWallet, IHagiVaultShield} from "../src/HagiGhost.sol";
import {HagiGhostSwap, IHagiSwapExact} from "../src/HagiGhostSwap.sol";

contract SwapStock is ERC20 {
    constructor(string memory s) ERC20(s, s) {}
    function mint(address to, uint256 a) external { _mint(to, a); }
}

contract HagiGhostSwapTest is Test {
    event NewCommitment(uint256 indexed commitment, uint256 index, address token, uint256 amount, bytes encryptedNote);

    address owner = address(0xA11CE);
    address relayer = address(0x5E1A);
    address treasury = address(0x7EA);
    address exchange = address(0xE8C);
    address stranger = address(0xBAD);
    HagiVault vault;
    HagiSwap swap;
    HagiGhostSwap gs;
    TestUSDG usdg;
    SwapStock amzn;
    SwapStock tsla;
    uint256 constant PARTIAL = 987654321;

    function setUp() public {
        usdg = new TestUSDG(owner);
        swap = new HagiSwap(IERC20(address(usdg)), owner);
        amzn = new SwapStock("AMZN");
        tsla = new SwapStock("TSLA");
        _seed(amzn, 100e18, 20_000e6); // 200 USDG each
        _seed(tsla, 100e18, 35_000e6); // 350 USDG each
        vault = new HagiVault(IVerifier(address(0xdead)), BasketRegistry(address(0xbeef)), owner);
        gs = new HagiGhostSwap(IHagiVaultShield(address(vault)), IHagiSwapExact(address(swap)), owner, 50, treasury, relayer);
        vm.startPrank(owner);
        vault.setTokenAllowed(address(usdg), true);
        vault.setTokenAllowed(address(amzn), true);
        vault.setTokenAllowed(address(tsla), true);
        usdg.mint(exchange, 100_000e6);
        vm.stopPrank();
        tsla.mint(exchange, 10e18);
    }

    function _seed(SwapStock t, uint256 amt, uint256 q) internal {
        t.mint(owner, amt);
        vm.startPrank(owner);
        usdg.mint(owner, q);
        t.approve(address(swap), amt);
        usdg.approve(address(swap), q);
        swap.addLiquidity(address(t), amt, q);
        vm.stopPrank();
    }

    function test_each_stock_gets_its_own_address() public view {
        address a = gs.ghostAddress(PARTIAL, address(amzn));
        assertTrue(a != gs.ghostAddress(PARTIAL, address(tsla)));
        assertTrue(a != gs.ghostAddress(PARTIAL + 1, address(amzn)));
        assertEq(a, address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(gs), keccak256(abi.encode(PARTIAL, address(amzn))), keccak256(type(GhostWallet).creationCode)))))));
    }

    function test_usdg_arrives_as_amzn() public {
        address g = gs.ghostAddress(PARTIAL, address(amzn));
        vm.prank(exchange);
        usdg.transfer(g, 1_000e6);
        uint256 net = 1_000e6 - 5e6;
        uint256 q = swap.quoteExactIn(address(usdg), address(amzn), net);
        uint256 c = PoseidonT4.hash([q, uint256(uint160(address(amzn))), PARTIAL]);
        vm.expectEmit(true, false, false, true, address(vault));
        emit NewCommitment(c, 0, address(amzn), q, "");
        vm.prank(relayer);
        assertEq(gs.claimSwap(PARTIAL, address(amzn), address(usdg), 1_000e6, q, ""), q);
        assertEq(amzn.balanceOf(address(vault)), q);
        assertEq(usdg.balanceOf(treasury), 5e6);
        assertEq(usdg.balanceOf(g), 0);
        assertEq(usdg.balanceOf(address(gs)), 0);
        assertEq(amzn.balanceOf(address(gs)), 0);
    }

    function test_stock_to_stock_and_same_token() public {
        address g = gs.ghostAddress(PARTIAL, address(amzn));
        vm.startPrank(exchange);
        tsla.transfer(g, 1e18);
        vm.stopPrank();
        uint256 q = swap.quoteExactIn(address(tsla), address(amzn), 1e18 - 5e15);
        vm.prank(relayer);
        gs.claimSwap(PARTIAL, address(amzn), address(tsla), 1e18, q, "");
        assertEq(amzn.balanceOf(address(vault)), q);
        // AMZN sent to an AMZN Ghost Swap just goes straight in
        amzn.mint(g, 2e18);
        vm.prank(relayer);
        gs.claimSwap(PARTIAL, address(amzn), address(amzn), 2e18, 0, "");
        assertEq(amzn.balanceOf(address(vault)), q + 2e18 - 1e16);
    }

    function test_only_the_relayer_can_swap() public {
        address g = gs.ghostAddress(PARTIAL, address(amzn));
        vm.prank(exchange);
        usdg.transfer(g, 100e6);
        vm.prank(stranger);
        vm.expectRevert(HagiGhostSwap.NotClaimer.selector);
        gs.claimSwap(PARTIAL, address(amzn), address(usdg), 100e6, 0, "");
    }

    function test_min_out_protects_the_owner() public {
        address g = gs.ghostAddress(PARTIAL, address(amzn));
        vm.prank(exchange);
        usdg.transfer(g, 100e6);
        uint256 q = swap.quoteExactIn(address(usdg), address(amzn), 100e6 - 5e5);
        vm.prank(relayer);
        vm.expectRevert();
        gs.claimSwap(PARTIAL, address(amzn), address(usdg), 100e6, q + 1, "");
        assertEq(usdg.balanceOf(g), 100e6);
    }

    function test_anyone_can_bring_it_in_without_a_swap() public {
        address g = gs.ghostAddress(PARTIAL, address(amzn));
        vm.prank(exchange);
        usdg.transfer(g, 100e6);
        vm.prank(stranger);
        gs.claim(PARTIAL, address(amzn), address(usdg), 100e6, "");
        assertEq(usdg.balanceOf(address(vault)), 100e6 - 5e5);
        assertEq(usdg.balanceOf(stranger), 0);
    }

    function test_owner_controls_claimers_and_fee_cap() public {
        vm.startPrank(owner);
        vm.expectRevert(HagiGhostSwap.FeeTooHigh.selector);
        gs.setFee(51, treasury);
        gs.setClaimer(stranger, true);
        vm.stopPrank();
        assertTrue(gs.claimer(stranger));
        vm.prank(stranger);
        vm.expectRevert();
        gs.setClaimer(stranger, false);
    }
}
