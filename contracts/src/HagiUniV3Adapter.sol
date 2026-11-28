// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ISwapAdapter} from "./HagiVault.sol";

/// Uniswap's SwapRouter02 (the version without a deadline in the params).
interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
}

/// @title HagiUniV3Adapter
/// @notice Lets the vault trade stock tokens on Uniswap v3. Every stock trades against USDG in one pool,
///         picked by its fee tier. USDG <-> stock is one hop; stock <-> stock goes through USDG.
/// @dev    Only the vault can call it. The vault sends the input here first, and the output goes straight
///         back to the vault. The vault itself enforces `minOut` on what it actually received, so a bad
///         route can only make a swap fail, never lose funds. The owner only picks fee tiers.
contract HagiUniV3Adapter is ISwapAdapter, Ownable {
    using SafeERC20 for IERC20;

    ISwapRouter02 public immutable router;
    address public immutable usdg;
    address public immutable vault;

    /// @notice The fee tier of the USDG pool each stock trades in. Zero means the stock has no route.
    mapping(address token => uint24) public feeOf;

    event FeeSet(address indexed token, uint24 fee);

    error OnlyVault();
    error NoRoute(address token);
    error SameToken();
    error BadLengths();

    constructor(ISwapRouter02 router_, address usdg_, address vault_, address owner_) Ownable(owner_) {
        router = router_;
        usdg = usdg_;
        vault = vault_;
    }

    function setFee(address token, uint24 fee) external onlyOwner {
        feeOf[token] = fee;
        emit FeeSet(token, fee);
    }

    function setFees(address[] calldata tokens, uint24[] calldata fees) external onlyOwner {
        if (tokens.length != fees.length) revert BadLengths();
        for (uint256 i; i < tokens.length; ++i) {
            feeOf[tokens[i]] = fees[i];
            emit FeeSet(tokens[i], fees[i]);
        }
    }

    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut) external returns (uint256 out) {
        if (msg.sender != vault) revert OnlyVault();
        if (tokenIn == tokenOut) revert SameToken();
        IERC20(tokenIn).forceApprove(address(router), amountIn);

        if (tokenIn == usdg || tokenOut == usdg) {
            uint24 fee = _fee(tokenIn == usdg ? tokenOut : tokenIn);
            out = router.exactInputSingle(ISwapRouter02.ExactInputSingleParams(tokenIn, tokenOut, fee, vault, amountIn, minOut, 0));
        } else {
            bytes memory path = abi.encodePacked(tokenIn, _fee(tokenIn), usdg, _fee(tokenOut), tokenOut);
            out = router.exactInput(ISwapRouter02.ExactInputParams(path, vault, amountIn, minOut));
        }
    }

    function _fee(address token) private view returns (uint24 fee) {
        fee = feeOf[token];
        if (fee == 0) revert NoRoute(token);
    }
}
