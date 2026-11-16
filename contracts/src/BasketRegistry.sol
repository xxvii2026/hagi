// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IHagiSwapPools {
    function hasPool(address token) external view returns (bool);
}

/// @title BasketRegistry
/// @notice Anyone can publish a basket: a named mix of listed stock tokens with fixed weights.
///         A basket can never be edited after creation. Names are not unique; the id is.
contract BasketRegistry is Ownable {
    uint256 public constant MIN_TOKENS = 2;
    uint256 public constant MAX_TOKENS = 8;
    uint256 public constant TOTAL_WEIGHT = 10_000; // basis points
    uint256 public constant MAX_NAME_BYTES = 32;

    struct Basket {
        address creator;
        uint64 createdAt;
        uint64 buyers;
        string name;
        address[] tokens;
        uint16[] weights;
    }

    IHagiSwapPools public immutable swap;
    /// @notice The only address allowed to record buys: the vault. The owner can repoint it if the vault is redeployed.
    address public recorder;

    Basket[] private _baskets;

    event BasketCreated(uint256 indexed id, address indexed creator, string name, address[] tokens, uint16[] weights);
    event BasketBought(uint256 indexed id, uint64 buyers);
    event RecorderSet(address recorder);

    error BadName();
    error BadLength();
    error TokenNotListed(address token);
    error DuplicateToken(address token);
    error ZeroWeight();
    error WeightsMustTotal10000(uint256 total);
    error NotRecorder();
    error NoBasket(uint256 id);

    constructor(IHagiSwapPools swap_, address owner_) Ownable(owner_) {
        swap = swap_;
    }

    function createBasket(string calldata name, address[] calldata tokens, uint16[] calldata weights) external returns (uint256 id) {
        uint256 nameLen = bytes(name).length;
        if (nameLen < 2 || nameLen > MAX_NAME_BYTES) revert BadName();
        uint256 n = tokens.length;
        if (n < MIN_TOKENS || n > MAX_TOKENS || weights.length != n) revert BadLength();

        uint256 total;
        for (uint256 i; i < n; ++i) {
            address t = tokens[i];
            if (!swap.hasPool(t)) revert TokenNotListed(t);
            for (uint256 j; j < i; ++j) {
                if (tokens[j] == t) revert DuplicateToken(t);
            }
            if (weights[i] == 0) revert ZeroWeight();
            total += weights[i];
        }
        if (total != TOTAL_WEIGHT) revert WeightsMustTotal10000(total);

        id = _baskets.length;
        _baskets.push(Basket({creator: msg.sender, createdAt: uint64(block.timestamp), buyers: 0, name: name, tokens: tokens, weights: weights}));
        emit BasketCreated(id, msg.sender, name, tokens, weights);
    }

    function basketCount() external view returns (uint256) {
        return _baskets.length;
    }

    function getBasket(uint256 id) external view returns (Basket memory) {
        if (id >= _baskets.length) revert NoBasket(id);
        return _baskets[id];
    }

    /// @notice Returns up to `limit` baskets starting at `start`, for listing in the app.
    function getBaskets(uint256 start, uint256 limit) external view returns (Basket[] memory page) {
        uint256 len = _baskets.length;
        if (start >= len) return new Basket[](0);
        uint256 end = start + limit > len ? len : start + limit;
        page = new Basket[](end - start);
        for (uint256 i = start; i < end; ++i) page[i - start] = _baskets[i];
    }

    function recordBuy(uint256 id) external {
        if (msg.sender != recorder) revert NotRecorder();
        if (id >= _baskets.length) revert NoBasket(id);
        uint64 b = ++_baskets[id].buyers;
        emit BasketBought(id, b);
    }

    function setRecorder(address recorder_) external onlyOwner {
        recorder = recorder_;
        emit RecorderSet(recorder_);
    }
}
