// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title HagiSwap
/// @notice Testnet liquidity for Hagi. One constant-product pool per stock token against the
///         quote token (test USDG), using the same x * y = k maths and 0.3% fee as Uniswap v2.
///         Stock-to-stock trades route through the quote token in two hops.
/// @dev    Liquidity is managed by the owner only. This is a testnet stand-in so the swap adapter
///         can be pointed at real Uniswap pools later.
contract HagiSwap is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant FEE_BPS = 30;
    uint256 private constant BPS = 10_000;

    IERC20 public immutable quote;

    struct Pool {
        uint128 reserveToken;
        uint128 reserveQuote;
    }

    mapping(address token => Pool) public pools;
    address[] public listedTokens;

    event LiquidityAdded(address indexed token, uint256 amountToken, uint256 amountQuote);
    event LiquidityRemoved(address indexed token, uint256 amountToken, uint256 amountQuote);
    event Swap(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address indexed to);

    error NoPool(address token);
    error SameToken();
    error ZeroAmount();
    error InsufficientOutput(uint256 amountOut, uint256 minOut);
    error BadTransfer();

    constructor(IERC20 quote_, address owner_) Ownable(owner_) {
        quote = quote_;
    }

    // ---------- views ----------

    function hasPool(address token) public view returns (bool) {
        return pools[token].reserveToken != 0;
    }

    function listedCount() external view returns (uint256) {
        return listedTokens.length;
    }

    /// @notice Price of one whole stock token in quote units (6 decimals), before fees and price impact.
    function spotPrice(address token) external view returns (uint256) {
        Pool memory p = pools[token];
        if (p.reserveToken == 0) revert NoPool(token);
        return (uint256(p.reserveQuote) * 1e18) / p.reserveToken;
    }

    /// @notice Output for an exact input, after the fee.
    function quoteExactIn(address tokenIn, address tokenOut, uint256 amountIn) public view returns (uint256 amountOut) {
        if (tokenIn == tokenOut) revert SameToken();
        if (tokenIn == address(quote)) {
            Pool memory p = _pool(tokenOut);
            return _out(amountIn, p.reserveQuote, p.reserveToken);
        }
        if (tokenOut == address(quote)) {
            Pool memory p = _pool(tokenIn);
            return _out(amountIn, p.reserveToken, p.reserveQuote);
        }
        Pool memory a = _pool(tokenIn);
        Pool memory b = _pool(tokenOut);
        return _out(_out(amountIn, a.reserveToken, a.reserveQuote), b.reserveQuote, b.reserveToken);
    }

    // ---------- swap ----------

    /// @notice Swap an exact amount of `tokenIn` for at least `minOut` of `tokenOut`, sent to `to`.
    function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address to)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        if (amountIn == 0) revert ZeroAmount();
        if (tokenIn == tokenOut) revert SameToken();

        uint256 received = _pull(IERC20(tokenIn), amountIn);

        if (tokenIn == address(quote)) {
            amountOut = _buy(tokenOut, received);
        } else if (tokenOut == address(quote)) {
            amountOut = _sell(tokenIn, received);
        } else {
            amountOut = _buy(tokenOut, _sell(tokenIn, received));
        }

        if (amountOut < minOut) revert InsufficientOutput(amountOut, minOut);
        IERC20(tokenOut).safeTransfer(to, amountOut);
        emit Swap(tokenIn, tokenOut, received, amountOut, to);
    }

    // ---------- liquidity (owner) ----------

    function addLiquidity(address token, uint256 amountToken, uint256 amountQuote) external onlyOwner nonReentrant {
        if (token == address(quote)) revert SameToken();
        if (amountToken == 0 || amountQuote == 0) revert ZeroAmount();
        Pool storage p = pools[token];
        if (p.reserveToken == 0) listedTokens.push(token);
        uint256 gotToken = _pull(IERC20(token), amountToken);
        uint256 gotQuote = _pull(quote, amountQuote);
        p.reserveToken += uint128(gotToken);
        p.reserveQuote += uint128(gotQuote);
        emit LiquidityAdded(token, gotToken, gotQuote);
    }

    function removeLiquidity(address token, uint256 amountToken, uint256 amountQuote, address to) external onlyOwner nonReentrant {
        Pool storage p = _poolStorage(token);
        p.reserveToken -= uint128(amountToken);
        p.reserveQuote -= uint128(amountQuote);
        if (amountToken != 0) IERC20(token).safeTransfer(to, amountToken);
        if (amountQuote != 0) quote.safeTransfer(to, amountQuote);
        emit LiquidityRemoved(token, amountToken, amountQuote);
    }

    // ---------- internals ----------

    function _buy(address token, uint256 quoteIn) private returns (uint256 out) {
        Pool storage p = _poolStorage(token);
        out = _out(quoteIn, p.reserveQuote, p.reserveToken);
        p.reserveQuote += uint128(quoteIn);
        p.reserveToken -= uint128(out);
    }

    function _sell(address token, uint256 tokenIn) private returns (uint256 out) {
        Pool storage p = _poolStorage(token);
        out = _out(tokenIn, p.reserveToken, p.reserveQuote);
        p.reserveToken += uint128(tokenIn);
        p.reserveQuote -= uint128(out);
    }

    /// @dev Uniswap v2 formula with the fee taken from the input.
    function _out(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) private pure returns (uint256) {
        uint256 inAfterFee = amountIn * (BPS - FEE_BPS);
        return (inAfterFee * reserveOut) / (reserveIn * BPS + inAfterFee);
    }

    /// @dev Pulls tokens and returns what actually arrived, so fee-on-transfer tokens cannot corrupt reserves.
    function _pull(IERC20 token, uint256 amount) private returns (uint256 received) {
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        received = token.balanceOf(address(this)) - before;
        if (received == 0) revert BadTransfer();
    }

    function _pool(address token) private view returns (Pool memory p) {
        p = pools[token];
        if (p.reserveToken == 0) revert NoPool(token);
    }

    function _poolStorage(address token) private view returns (Pool storage p) {
        p = pools[token];
        if (p.reserveToken == 0) revert NoPool(token);
    }
}
