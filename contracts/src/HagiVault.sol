// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";
import {PoseidonT4} from "poseidon-solidity/PoseidonT4.sol";
import {BasketRegistry} from "./BasketRegistry.sol";

interface IVerifier {
    function verifyProof(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[8] calldata pubSignals)
        external
        view
        returns (bool);
}

interface ISwapAdapter {
    /// @dev `amountIn` of `tokenIn` has already been sent to the adapter. It must send the output to the caller.
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut) external returns (uint256);
}

/// @title HagiVault
/// @notice A shielded pool for stock tokens and test USDG. Funds are held as notes: commitments in a
///         Merkle tree that only the owner's key can spend, proven with a zero-knowledge proof.
///
///         commitment = Poseidon(amount, token, partial), partial = Poseidon(publicKey, blinding)
///
///         - shield:   deposit publicly; the vault completes the note from the partial commitment.
///         - transact: spend up to two notes into two new notes, optionally withdrawing to an address
///                     or swapping through the adapter, where each swap output becomes a new note.
///
/// @dev    Design adapted from Tornado Nova. There is no admin path to user funds. The owner can only
///         list tokens and replace the swap adapter, and a swap is always bounded by the user's minOut.
///         TESTNET ONLY: not audited, and the proving keys come from a single-party setup.
contract HagiVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 public constant LEVELS = 20;
    uint256 public constant ROOT_HISTORY = 100;
    uint256 public constant MAX_AMOUNT = type(uint128).max;
    uint256 public constant MAX_LEGS = 8;
    uint256 public constant NO_BASKET = type(uint256).max;

    struct Proof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
        uint256 root;
        uint256[2] nullifiers;
        uint256[2] commitments;
    }

    struct SwapLeg {
        address tokenOut;
        uint256 amountIn;
        uint256 minOut;
        uint256 partialCommitment;
        bytes encryptedNote;
    }

    struct ExtData {
        address recipient; // receives `amount` when there are no swap legs
        address token; // the token leaving the notes, or address(0) for a private transfer
        uint256 amount; // withdrawn, or the total swapped across legs
        address relayer;
        uint256 fee; // paid to the relayer in `token`
        bytes encryptedOutput1;
        bytes encryptedOutput2;
        SwapLeg[] legs;
        uint256 basketId; // NO_BASKET unless the legs buy a registered basket
    }

    IVerifier public immutable verifier;
    BasketRegistry public immutable registry;
    ISwapAdapter public adapter;

    mapping(address token => bool) public allowedToken;
    /// @dev Once a token has been allowed it can always be withdrawn, even if it is later disallowed.
    mapping(address token => bool) public everAllowed;

    // ---------- beta guards ----------
    // While the vault is unaudited, deposits are capped and can be paused. Withdrawals and private
    // transfers are never blocked by these, so users can always get out.

    /// @notice Stops new shields and swaps. Withdrawals and private transfers keep working.
    bool public paused;

    struct ShieldLimit {
        uint128 perAddress; // most one address can ever shield of this token
        uint128 total; // most of this token the vault holds on users' behalf (shielded minus withdrawn)
    }

    /// @notice A token with no limit set cannot be shielded directly. It can still arrive through swaps.
    mapping(address token => ShieldLimit) public shieldLimit;
    mapping(address token => mapping(address from => uint256)) public shieldedBy;
    mapping(address token => uint256) public netShielded;
    mapping(uint256 nullifier => bool) public nullifierSpent;

    // Incremental Merkle tree
    uint256[LEVELS] public zeros;
    uint256[LEVELS] public filledSubtrees;
    mapping(uint256 => uint256) public roots;
    uint32 public currentRootIndex;
    uint32 public nextIndex;

    /// @dev `token` and `amount` are zero for private outputs, and public for shields and swap outputs.
    event NewCommitment(uint256 indexed commitment, uint256 index, address token, uint256 amount, bytes encryptedNote);
    event NewNullifier(uint256 indexed nullifier);
    event TokenAllowed(address indexed token, bool allowed);
    event AdapterSet(address adapter);
    event PausedSet(bool paused);
    event ShieldLimitSet(address indexed token, uint128 perAddress, uint128 total);

    error TokenNotAllowed(address token);
    error BadAmount();
    error BadFieldElement();
    error BadTransfer();
    error UnknownRoot();
    error NullifierSpent(uint256 nullifier);
    error InvalidProof();
    error BadExtData();
    error TreeFull();
    error SwapOutputTooLow(uint256 got, uint256 minOut);
    error BasketMismatch();
    error Paused();
    error OverAddressLimit(uint256 wouldBe, uint256 limit);
    error OverTotalLimit(uint256 wouldBe, uint256 limit);

    constructor(IVerifier verifier_, BasketRegistry registry_, address owner_) Ownable(owner_) {
        verifier = verifier_;
        registry = registry_;
        uint256 z = uint256(keccak256("hagi.vault.empty")) % FIELD;
        for (uint256 i; i < LEVELS; ++i) {
            zeros[i] = z;
            filledSubtrees[i] = z;
            z = PoseidonT3.hash([z, z]);
        }
        roots[0] = z;
    }

    // ---------- shield ----------

    /// @notice Deposit `amount` of `token` into a new note owned by whoever knows the partial commitment's key.
    function shield(address token, uint256 amount, uint256 partialCommitment, bytes calldata encryptedNote) external nonReentrant {
        if (paused) revert Paused();
        if (!allowedToken[token]) revert TokenNotAllowed(token);
        if (amount == 0 || amount > MAX_AMOUNT) revert BadAmount();
        if (partialCommitment >= FIELD) revert BadFieldElement();

        ShieldLimit memory lim = shieldLimit[token];
        uint256 mine = shieldedBy[token][msg.sender] + amount;
        if (mine > lim.perAddress) revert OverAddressLimit(mine, lim.perAddress);
        uint256 all = netShielded[token] + amount;
        if (all > lim.total) revert OverTotalLimit(all, lim.total);
        shieldedBy[token][msg.sender] = mine;
        netShielded[token] = all;

        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        if (IERC20(token).balanceOf(address(this)) - before != amount) revert BadTransfer();

        _addNote(amount, token, partialCommitment, encryptedNote);
    }

    // ---------- transact ----------

    function transact(Proof calldata p, ExtData calldata ext) external nonReentrant {
        if (!isKnownRoot(p.root)) revert UnknownRoot();
        for (uint256 i; i < 2; ++i) {
            if (nullifierSpent[p.nullifiers[i]]) revert NullifierSpent(p.nullifiers[i]);
        }

        uint256 leaving = ext.amount + ext.fee;
        if (ext.amount > MAX_AMOUNT || ext.fee > MAX_AMOUNT) revert BadAmount();
        uint256 publicAmount;
        uint256 publicToken;
        if (leaving != 0) {
            // Withdrawals only need the token to have been allowed at some point, so disallowing a token
            // can never trap funds. Spending it into a swap needs it to be allowed right now.
            if (!everAllowed[ext.token]) revert TokenNotAllowed(ext.token);
            publicAmount = FIELD - leaving;
            publicToken = uint256(uint160(ext.token));
        }

        uint256 extDataHash = uint256(keccak256(abi.encode(ext))) % FIELD;
        if (
            !verifier.verifyProof(
                p.a,
                p.b,
                p.c,
                [p.root, publicAmount, publicToken, extDataHash, p.nullifiers[0], p.nullifiers[1], p.commitments[0], p.commitments[1]]
            )
        ) revert InvalidProof();

        for (uint256 i; i < 2; ++i) {
            nullifierSpent[p.nullifiers[i]] = true;
            emit NewNullifier(p.nullifiers[i]);
        }
        emit NewCommitment(p.commitments[0], _insert(p.commitments[0]), address(0), 0, ext.encryptedOutput1);
        emit NewCommitment(p.commitments[1], _insert(p.commitments[1]), address(0), 0, ext.encryptedOutput2);

        if (ext.legs.length == 0) {
            if (ext.basketId != NO_BASKET) revert BadExtData();
            if (ext.amount != 0) {
                if (ext.recipient == address(0)) revert BadExtData();
                _left(ext.token, ext.amount);
                IERC20(ext.token).safeTransfer(ext.recipient, ext.amount);
            }
        } else {
            if (paused) revert Paused();
            if (!allowedToken[ext.token]) revert TokenNotAllowed(ext.token);
            _swapLegs(ext);
        }

        if (ext.fee != 0) {
            if (ext.relayer == address(0)) revert BadExtData();
            _left(ext.token, ext.fee);
            IERC20(ext.token).safeTransfer(ext.relayer, ext.fee);
        }
    }

    /// @dev Each leg leaves the vault, is swapped by the adapter and comes straight back as a new note.
    function _swapLegs(ExtData calldata ext) private {
        uint256 n = ext.legs.length;
        if (n > MAX_LEGS || ext.recipient != address(0)) revert BadExtData();

        bool isBasket = ext.basketId != NO_BASKET;
        BasketRegistry.Basket memory basket;
        if (isBasket) {
            basket = registry.getBasket(ext.basketId);
            if (basket.tokens.length != n) revert BasketMismatch();
        }

        ISwapAdapter adapter_ = adapter;
        uint256 total;
        for (uint256 i; i < n; ++i) {
            SwapLeg calldata leg = ext.legs[i];
            if (!allowedToken[leg.tokenOut] || leg.tokenOut == ext.token) revert TokenNotAllowed(leg.tokenOut);
            if (leg.partialCommitment >= FIELD) revert BadFieldElement();
            if (leg.amountIn == 0) revert BadAmount();
            if (isBasket) {
                // Every leg but the last takes its weight of the total; the last takes the remainder.
                uint256 expected = i + 1 < n ? (ext.amount * basket.weights[i]) / 10_000 : ext.amount - total;
                if (leg.tokenOut != basket.tokens[i] || leg.amountIn != expected) revert BasketMismatch();
            }
            total += leg.amountIn;

            uint256 before = IERC20(leg.tokenOut).balanceOf(address(this));
            IERC20(ext.token).safeTransfer(address(adapter_), leg.amountIn);
            adapter_.swap(ext.token, leg.tokenOut, leg.amountIn, leg.minOut);
            uint256 got = IERC20(leg.tokenOut).balanceOf(address(this)) - before;
            if (got == 0 || got < leg.minOut) revert SwapOutputTooLow(got, leg.minOut);
            if (got > MAX_AMOUNT) revert BadAmount();

            _addNote(got, leg.tokenOut, leg.partialCommitment, leg.encryptedNote);
        }
        if (total != ext.amount) revert BadExtData();
        if (isBasket) registry.recordBuy(ext.basketId);
    }

    // ---------- owner ----------

    function setTokenAllowed(address token, bool allowed) external onlyOwner {
        allowedToken[token] = allowed;
        if (allowed) everAllowed[token] = true;
        emit TokenAllowed(token, allowed);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedSet(paused_);
    }

    /// @notice Sets how much of `token` one address, and the vault as a whole, can shield. Zero closes shielding.
    function setShieldLimit(address token, uint128 perAddress, uint128 total) external onlyOwner {
        shieldLimit[token] = ShieldLimit(perAddress, total);
        emit ShieldLimitSet(token, perAddress, total);
    }

    function setAdapter(ISwapAdapter adapter_) external onlyOwner {
        adapter = adapter_;
        emit AdapterSet(address(adapter_));
    }

    // ---------- views ----------

    function isKnownRoot(uint256 root) public view returns (bool) {
        if (root == 0) return false;
        uint256 i = currentRootIndex;
        for (uint256 n; n < ROOT_HISTORY; ++n) {
            if (roots[i] == root) return true;
            i = i == 0 ? ROOT_HISTORY - 1 : i - 1;
        }
        return false;
    }

    function latestRoot() external view returns (uint256) {
        return roots[currentRootIndex];
    }

    // ---------- internals ----------

    /// @dev Frees room under the total limit when a token leaves the vault. Never underflows: more can leave
    ///      than was shielded when it arrived through swaps.
    function _left(address token, uint256 amount) private {
        uint256 n = netShielded[token];
        netShielded[token] = amount >= n ? 0 : n - amount;
    }

    function _addNote(uint256 amount, address token, uint256 partialCommitment, bytes calldata encryptedNote) private {
        uint256 commitment = PoseidonT4.hash([amount, uint256(uint160(token)), partialCommitment]);
        emit NewCommitment(commitment, _insert(commitment), token, amount, encryptedNote);
    }

    function _insert(uint256 leaf) private returns (uint256 index) {
        index = nextIndex;
        if (index == 2 ** LEVELS) revert TreeFull();
        uint256 cur = index;
        uint256 h = leaf;
        for (uint256 i; i < LEVELS; ++i) {
            if (cur % 2 == 0) {
                filledSubtrees[i] = h;
                h = PoseidonT3.hash([h, zeros[i]]);
            } else {
                h = PoseidonT3.hash([filledSubtrees[i], h]);
            }
            cur /= 2;
        }
        uint32 r = uint32((currentRootIndex + 1) % ROOT_HISTORY);
        currentRootIndex = r;
        roots[r] = h;
        nextIndex = uint32(index + 1);
    }
}
