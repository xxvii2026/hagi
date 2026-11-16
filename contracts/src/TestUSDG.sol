// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Hagi Test USDG
/// @notice A free test dollar for Hagi on Robinhood Chain Testnet. It has no value.
///         Anyone can claim a fixed amount once per day. The owner can mint to seed pools.
contract TestUSDG is ERC20, Ownable {
    uint256 public constant FAUCET_AMOUNT = 5_000e6;
    uint256 public constant FAUCET_COOLDOWN = 1 days;

    mapping(address => uint256) public lastClaim;

    error FaucetCooldown(uint256 availableAt);

    constructor(address owner_) ERC20("Hagi Test USDG", "USDG") Ownable(owner_) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Claim test dollars. Limited to once per day per address.
    function faucet() external {
        uint256 last = lastClaim[msg.sender];
        if (last != 0 && block.timestamp < last + FAUCET_COOLDOWN) revert FaucetCooldown(last + FAUCET_COOLDOWN);
        lastClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
