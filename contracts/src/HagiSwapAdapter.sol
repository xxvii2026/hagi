// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {HagiSwap} from "./HagiSwap.sol";
import {ISwapAdapter} from "./HagiVault.sol";

/// @title HagiSwapAdapter
/// @notice Lets the vault trade through HagiSwap. The vault sends the input here, the adapter swaps
///         it and sends the output straight back. To move to Uniswap, deploy a new adapter with the
///         same interface and point the vault at it.
contract HagiSwapAdapter is ISwapAdapter {
    using SafeERC20 for IERC20;

    HagiSwap public immutable pools;
    address public immutable vault;

    error OnlyVault();

    constructor(HagiSwap pools_, address vault_) {
        pools = pools_;
        vault = vault_;
    }

    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut) external returns (uint256) {
        if (msg.sender != vault) revert OnlyVault();
        IERC20(tokenIn).forceApprove(address(pools), amountIn);
        return pools.swapExactIn(tokenIn, tokenOut, amountIn, minOut, vault);
    }
}
