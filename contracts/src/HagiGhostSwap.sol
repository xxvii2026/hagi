// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {GhostWallet, IHagiVaultShield} from "./HagiGhost.sol";

interface IHagiSwapExact {
    function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address to) external returns (uint256);
}

/// @title HagiGhostSwap
/// @notice Ghost Swaps: a Ghost Address that also fixes which stock the money arrives as. Send USDG (or any listed
///         token) to it from anywhere, and the claim swaps it and shields the result, so it lands as, say, AMZN.
///
///         The address is the CREATE2 address of a GhostWallet salted with keccak(partialCommitment, tokenOut).
///         Both the owner's note and the target stock are part of the address, so nobody can redirect the funds
///         or change what they turn into.
///
///         - claimSwap: swaps through the Hagi pools and shields the output. Only approved claimers (the Hagi
///           relayer) can call it, because a swap needs a fair minimum output that a stranger could set badly.
///         - claim: anyone can call it. It skips the swap and shields the token exactly as it arrived, so funds
///           can never get stuck if the relayer is gone.
///
/// @dev    TESTNET ONLY: not audited. The output note is completed on chain from public amounts, so the owner's
///         app recognises it from the Ghost Address it made.
contract HagiGhostSwap is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 public constant MAX_FEE_BPS = 50; // 0.5%

    IHagiVaultShield public immutable vault;
    IHagiSwapExact public immutable pools;
    bytes32 public immutable walletCodeHash;

    uint256 public feeBps;
    address public feeTo;
    mapping(address => bool) public claimer;

    event GhostSwapped(address indexed ghost, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee);
    event GhostClaimed(address indexed ghost, address indexed token, uint256 amount, uint256 fee);
    event FeeSet(uint256 feeBps, address feeTo);
    event ClaimerSet(address indexed who, bool allowed);

    error BadFieldElement();
    error BadAmount();
    error BadTransfer();
    error FeeTooHigh();
    error NoFeeRecipient();
    error NotClaimer();

    constructor(IHagiVaultShield vault_, IHagiSwapExact pools_, address owner_, uint256 feeBps_, address feeTo_, address claimer_)
        Ownable(owner_)
    {
        vault = vault_;
        pools = pools_;
        walletCodeHash = keccak256(type(GhostWallet).creationCode);
        _setFee(feeBps_, feeTo_);
        if (claimer_ != address(0)) {
            claimer[claimer_] = true;
            emit ClaimerSet(claimer_, true);
        }
    }

    function saltOf(uint256 partialCommitment, address tokenOut) public pure returns (bytes32) {
        return keccak256(abi.encode(partialCommitment, tokenOut));
    }

    /// @notice The Ghost Swap address for a partial commitment and the stock it should arrive as.
    function ghostAddress(uint256 partialCommitment, address tokenOut) public view returns (address) {
        return address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), saltOf(partialCommitment, tokenOut), walletCodeHash))))
        );
    }

    /// @notice Swaps `amount` of `tokenIn` waiting at the address into `tokenOut` and shields it for the owner.
    function claimSwap(uint256 partialCommitment, address tokenOut, address tokenIn, uint256 amount, uint256 minOut, bytes calldata encryptedNote)
        external
        nonReentrant
        returns (uint256 out)
    {
        if (!claimer[msg.sender]) revert NotClaimer();
        (address ghost, uint256 net, uint256 fee) = _pull(partialCommitment, tokenOut, tokenIn, amount);
        if (tokenIn == tokenOut) {
            out = net;
        } else {
            IERC20(tokenIn).forceApprove(address(pools), net);
            uint256 before = IERC20(tokenOut).balanceOf(address(this));
            pools.swapExactIn(tokenIn, tokenOut, net, minOut, address(this));
            out = IERC20(tokenOut).balanceOf(address(this)) - before;
            if (out == 0 || out < minOut) revert BadAmount();
        }
        IERC20(tokenOut).forceApprove(address(vault), out);
        vault.shield(tokenOut, out, partialCommitment, encryptedNote);
        emit GhostSwapped(ghost, tokenIn, tokenOut, amount, out, fee);
    }

    /// @notice Anyone can move the funds in without a swap. They land as the token that was sent.
    function claim(uint256 partialCommitment, address tokenOut, address tokenIn, uint256 amount, bytes calldata encryptedNote)
        external
        nonReentrant
        returns (uint256 net)
    {
        address ghost;
        uint256 fee;
        (ghost, net, fee) = _pull(partialCommitment, tokenOut, tokenIn, amount);
        IERC20(tokenIn).forceApprove(address(vault), net);
        vault.shield(tokenIn, net, partialCommitment, encryptedNote);
        emit GhostClaimed(ghost, tokenIn, amount, fee);
    }

    function netOf(uint256 amount) external view returns (uint256) {
        return amount - (amount * feeBps) / 10_000;
    }

    function _pull(uint256 partialCommitment, address tokenOut, address tokenIn, uint256 amount)
        private
        returns (address ghost, uint256 net, uint256 fee)
    {
        if (partialCommitment >= FIELD) revert BadFieldElement();
        if (amount == 0) revert BadAmount();
        ghost = ghostAddress(partialCommitment, tokenOut);
        if (ghost.code.length == 0) new GhostWallet{salt: saltOf(partialCommitment, tokenOut)}();

        uint256 before = IERC20(tokenIn).balanceOf(address(this));
        GhostWallet(ghost).pull(tokenIn, amount);
        if (IERC20(tokenIn).balanceOf(address(this)) - before != amount) revert BadTransfer();

        fee = (amount * feeBps) / 10_000;
        net = amount - fee;
        if (net == 0) revert BadAmount();
        if (fee != 0) IERC20(tokenIn).safeTransfer(feeTo, fee);
    }

    // ---------- owner ----------

    function setFee(uint256 feeBps_, address feeTo_) external onlyOwner {
        _setFee(feeBps_, feeTo_);
    }

    function setClaimer(address who, bool allowed) external onlyOwner {
        claimer[who] = allowed;
        emit ClaimerSet(who, allowed);
    }

    function _setFee(uint256 feeBps_, address feeTo_) private {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        if (feeBps_ != 0 && feeTo_ == address(0)) revert NoFeeRecipient();
        feeBps = feeBps_;
        feeTo = feeTo_;
        emit FeeSet(feeBps_, feeTo_);
    }
}
