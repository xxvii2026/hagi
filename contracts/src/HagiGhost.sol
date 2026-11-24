// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IHagiVaultShield {
    function shield(address token, uint256 amount, uint256 partialCommitment, bytes calldata encryptedNote) external;
}

/// @title GhostWallet
/// @notice The contract that sits at a Ghost Address once it has been claimed from for the first time.
///         It holds whatever was sent to it, and only the factory that made it can move it out.
contract GhostWallet {
    using SafeERC20 for IERC20;

    address public immutable factory;

    error OnlyFactory();

    constructor() {
        factory = msg.sender;
    }

    function pull(address token, uint256 amount) external {
        if (msg.sender != factory) revert OnlyFactory();
        IERC20(token).safeTransfer(msg.sender, amount);
    }
}

/// @title HagiGhost
/// @notice Ghost Addresses: a normal 0x address that anyone can send to (from a wallet, an exchange, anything),
///         whose funds can only ever end up in one private note in the Hagi vault.
///
///         A Ghost Address is the CREATE2 address of a GhostWallet, salted with a partial commitment
///         `Poseidon(publicKey, blinding)` that only its owner's Hagi keys can make. Sending to it needs no
///         contract to exist yet. Claiming deploys the wallet if needed, pulls the funds and shields them
///         into a note completed from that same partial commitment, so only the owner can spend the result.
///
///         Claiming needs no signature: whoever calls `claim` (normally the Hagi relayer) can only move the
///         funds to their owner's note. A small platform fee is taken on the way in.
///
/// @dev    TESTNET ONLY: not audited. Tokens the vault does not list cannot be claimed and stay at the address.
contract HagiGhost is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 public constant MAX_FEE_BPS = 50; // 0.5%

    IHagiVaultShield public immutable vault;
    bytes32 public immutable walletCodeHash;

    uint256 public feeBps;
    address public feeTo;

    event GhostClaimed(address indexed ghost, address indexed token, uint256 amount, uint256 fee);
    event FeeSet(uint256 feeBps, address feeTo);

    error BadFieldElement();
    error BadAmount();
    error BadTransfer();
    error FeeTooHigh();
    error NoFeeRecipient();

    constructor(IHagiVaultShield vault_, address owner_, uint256 feeBps_, address feeTo_) Ownable(owner_) {
        vault = vault_;
        walletCodeHash = keccak256(type(GhostWallet).creationCode);
        _setFee(feeBps_, feeTo_);
    }

    /// @notice The Ghost Address for a partial commitment. Funds can be sent here before anything is deployed.
    function ghostAddress(uint256 partialCommitment) public view returns (address) {
        return address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), bytes32(partialCommitment), walletCodeHash))))
        );
    }

    /// @notice Moves `amount` of `token` from a Ghost Address into a private note owned by the address's owner.
    /// @param  encryptedNote the note encrypted to the owner, so their app can find it. The owner's app can
    ///         also recognise the note without it, so a bad value from a third party cannot hide the funds.
    /// @return net the amount that went into the note, after the fee.
    function claim(uint256 partialCommitment, address token, uint256 amount, bytes calldata encryptedNote)
        external
        nonReentrant
        returns (uint256 net)
    {
        if (partialCommitment >= FIELD) revert BadFieldElement();
        if (amount == 0) revert BadAmount();

        address ghost = ghostAddress(partialCommitment);
        if (ghost.code.length == 0) new GhostWallet{salt: bytes32(partialCommitment)}();

        uint256 before = IERC20(token).balanceOf(address(this));
        GhostWallet(ghost).pull(token, amount);
        if (IERC20(token).balanceOf(address(this)) - before != amount) revert BadTransfer();

        uint256 fee = (amount * feeBps) / 10_000;
        net = amount - fee;
        if (net == 0) revert BadAmount();
        if (fee != 0) IERC20(token).safeTransfer(feeTo, fee);

        IERC20(token).forceApprove(address(vault), net);
        vault.shield(token, net, partialCommitment, encryptedNote);
        emit GhostClaimed(ghost, token, amount, fee);
    }

    /// @notice What `claim` would put into the note for a given amount.
    function netOf(uint256 amount) external view returns (uint256) {
        return amount - (amount * feeBps) / 10_000;
    }

    // ---------- owner ----------

    /// @notice Sets the platform fee. It can never go above 0.5%, and the owner can never move funds at a Ghost Address.
    function setFee(uint256 feeBps_, address feeTo_) external onlyOwner {
        _setFee(feeBps_, feeTo_);
    }

    function _setFee(uint256 feeBps_, address feeTo_) private {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        if (feeBps_ != 0 && feeTo_ == address(0)) revert NoFeeRecipient();
        feeBps = feeBps_;
        feeTo = feeTo_;
        emit FeeSet(feeBps_, feeTo_);
    }
}
