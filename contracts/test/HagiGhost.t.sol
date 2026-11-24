// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PoseidonT4} from "poseidon-solidity/PoseidonT4.sol";
import {HagiVault, IVerifier} from "../src/HagiVault.sol";
import {BasketRegistry} from "../src/BasketRegistry.sol";
import {HagiGhost, GhostWallet, IHagiVaultShield} from "../src/HagiGhost.sol";

contract GhostToken is ERC20 {
    constructor(string memory s) ERC20(s, s) {}
    function mint(address to, uint256 a) external { _mint(to, a); }
}

contract HagiGhostTest is Test {
    event NewCommitment(uint256 indexed commitment, uint256 index, address token, uint256 amount, bytes encryptedNote);
    event GhostClaimed(address indexed ghost, address indexed token, uint256 amount, uint256 fee);

    address owner = address(0xA11CE);
    address treasury = address(0x7EA);
    address exchange = address(0xE8C);
    address stranger = address(0xBAD);
    HagiVault vault;
    HagiGhost ghost;
    GhostToken usdg;
    GhostToken tsla;
    GhostToken unlisted;
    uint256 constant PARTIAL = 123456789;

    function setUp() public {
        vault = new HagiVault(IVerifier(address(0xdead)), BasketRegistry(address(0xbeef)), owner);
        ghost = new HagiGhost(IHagiVaultShield(address(vault)), owner, 50, treasury);
        usdg = new GhostToken("USDG");
        tsla = new GhostToken("TSLA");
        unlisted = new GhostToken("NOPE");
        vm.startPrank(owner);
        vault.setTokenAllowed(address(usdg), true);
        vault.setTokenAllowed(address(tsla), true);
        vm.stopPrank();
        usdg.mint(exchange, 1_000_000e6);
        tsla.mint(exchange, 100e18);
    }

    function test_address_is_counterfactual_and_stable() public view {
        address a = ghost.ghostAddress(PARTIAL);
        assertEq(a, ghost.ghostAddress(PARTIAL));
        assertTrue(a != ghost.ghostAddress(PARTIAL + 1));
        assertEq(a.code.length, 0);
        bytes32 h = keccak256(type(GhostWallet).creationCode);
        assertEq(ghost.walletCodeHash(), h);
        assertEq(a, address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(ghost), bytes32(PARTIAL), h))))));
    }

    function test_claim_shields_into_the_owners_note() public {
        address g = ghost.ghostAddress(PARTIAL);
        vm.prank(exchange);
        usdg.transfer(g, 1_000e6);

        uint256 net = 1_000e6 - 5e6; // 0.5% fee
        uint256 c = PoseidonT4.hash([net, uint256(uint160(address(usdg))), PARTIAL]);
        vm.expectEmit(true, false, false, true, address(vault));
        emit NewCommitment(c, 0, address(usdg), net, hex"abcd");
        vm.expectEmit(true, true, false, true, address(ghost));
        emit GhostClaimed(g, address(usdg), 1_000e6, 5e6);
        vm.prank(stranger); // anyone can claim: the funds can only go to the note
        assertEq(ghost.claim(PARTIAL, address(usdg), 1_000e6, hex"abcd"), net);

        assertEq(usdg.balanceOf(address(vault)), net);
        assertEq(usdg.balanceOf(treasury), 5e6);
        assertEq(usdg.balanceOf(g), 0);
        assertEq(usdg.balanceOf(address(ghost)), 0);
        assertEq(usdg.balanceOf(stranger), 0);
        assertGt(g.code.length, 0);
        assertEq(vault.nextIndex(), 1);
    }

    function test_address_can_be_reused_and_claimed_in_parts() public {
        address g = ghost.ghostAddress(PARTIAL);
        vm.startPrank(exchange);
        usdg.transfer(g, 300e6);
        tsla.transfer(g, 2e18);
        vm.stopPrank();
        ghost.claim(PARTIAL, address(usdg), 100e6, "");
        ghost.claim(PARTIAL, address(usdg), 200e6, "");
        ghost.claim(PARTIAL, address(tsla), 2e18, "");
        vm.prank(exchange);
        usdg.transfer(g, 50e6);
        ghost.claim(PARTIAL, address(usdg), 50e6, "");
        assertEq(vault.nextIndex(), 4);
        assertEq(usdg.balanceOf(g), 0);
        assertEq(tsla.balanceOf(address(vault)), 2e18 - 1e16);
    }

    function test_cannot_claim_more_than_is_there() public {
        address g = ghost.ghostAddress(PARTIAL);
        vm.prank(exchange);
        usdg.transfer(g, 10e6);
        vm.expectRevert();
        ghost.claim(PARTIAL, address(usdg), 11e6, "");
        vm.expectRevert(HagiGhost.BadAmount.selector);
        ghost.claim(PARTIAL, address(usdg), 0, "");
        // one unit: the fee rounds down to zero, so it still goes in whole
        ghost.claim(PARTIAL, address(usdg), 1, "");
        assertEq(usdg.balanceOf(address(vault)), 1);
    }

    function test_unlisted_tokens_stay_put() public {
        address g = ghost.ghostAddress(PARTIAL);
        unlisted.mint(g, 5e18);
        vm.expectRevert(abi.encodeWithSelector(HagiVault.TokenNotAllowed.selector, address(unlisted)));
        ghost.claim(PARTIAL, address(unlisted), 5e18, "");
        assertEq(unlisted.balanceOf(g), 5e18);
    }

    function test_partial_must_be_a_field_element() public {
        uint256 bad = ghost.FIELD();
        vm.expectRevert(HagiGhost.BadFieldElement.selector);
        ghost.claim(bad, address(usdg), 1, "");
    }

    function test_only_the_factory_moves_wallet_funds() public {
        address g = ghost.ghostAddress(PARTIAL);
        vm.prank(exchange);
        usdg.transfer(g, 10e6);
        ghost.claim(PARTIAL, address(usdg), 5e6, ""); // deploys the wallet
        vm.prank(owner);
        vm.expectRevert(GhostWallet.OnlyFactory.selector);
        GhostWallet(g).pull(address(usdg), 5e6);
        vm.expectRevert(GhostWallet.OnlyFactory.selector);
        GhostWallet(g).pull(address(usdg), 5e6);
    }

    function test_fee_is_capped_and_owner_only() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vm.prank(stranger);
        ghost.setFee(0, address(0));
        vm.startPrank(owner);
        vm.expectRevert(HagiGhost.FeeTooHigh.selector);
        ghost.setFee(51, treasury);
        vm.expectRevert(HagiGhost.NoFeeRecipient.selector);
        ghost.setFee(10, address(0));
        ghost.setFee(0, address(0));
        vm.stopPrank();
        address g = ghost.ghostAddress(PARTIAL);
        vm.prank(exchange);
        usdg.transfer(g, 100e6);
        assertEq(ghost.netOf(100e6), 100e6);
        ghost.claim(PARTIAL, address(usdg), 100e6, "");
        assertEq(usdg.balanceOf(address(vault)), 100e6);
    }
}
