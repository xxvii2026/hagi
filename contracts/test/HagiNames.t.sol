// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {HagiNames} from "../src/HagiNames.sol";

contract HagiNamesTest is Test {
    HagiNames names;
    address owner = address(0xA11CE);
    bytes alice = abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)));
    bytes bob = abi.encodePacked(bytes32(uint256(3)), bytes32(uint256(4)));

    function setUp() public {
        names = new HagiNames(owner);
        string[] memory r = new string[](1);
        r[0] = "robinhood";
        vm.prank(owner);
        names.setReserved(r, true);
    }

    function test_claimAndResolve() public {
        names.claim("eric", alice);
        assertEq(names.addrOf("eric"), alice);
        assertEq(names.nameOf(alice), "eric");
        assertEq(names.count(), 1);
        assertFalse(names.available("eric"));
    }

    function test_takenAndOnePerAddress() public {
        names.claim("eric", alice);
        vm.expectRevert(HagiNames.Taken.selector);
        names.claim("eric", bob);
        vm.expectRevert(HagiNames.AddressHasName.selector);
        names.claim("eric2", alice);
    }

    function test_rules() public {
        vm.expectRevert(HagiNames.BadName.selector);
        names.claim("Eric", alice);
        vm.expectRevert(HagiNames.BadName.selector);
        names.claim("-eric", alice);
        vm.expectRevert(HagiNames.BadName.selector);
        names.claim("er--ic", alice);
        vm.expectRevert(HagiNames.BadName.selector);
        names.claim("abc", alice);
        vm.expectRevert(HagiNames.BadName.selector);
        names.claim("thisnameiswaytoolongok", alice);
        vm.expectRevert(HagiNames.Reserved.selector);
        names.claim("robinhood", alice);
        vm.expectRevert(HagiNames.BadAddress.selector);
        names.claim("eric", hex"01");
        names.claim("e-ric9", alice);
    }

    function test_ownerGrantAndRelease() public {
        vm.prank(owner);
        names.grant("hagi", alice);
        assertEq(names.addrOf("hagi"), alice);
        vm.prank(owner);
        names.grant("x", bob);
        vm.expectRevert();
        names.grant("zz", bob);
        vm.prank(owner);
        names.release("hagi");
        assertEq(names.addrOf("hagi").length, 0);
        assertEq(bytes(names.nameOf(alice)).length, 0);
        names.claim("alice", alice);
    }
}
