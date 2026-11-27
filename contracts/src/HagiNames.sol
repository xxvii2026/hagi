// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title HagiNames
/// @notice name.hagi -> hagi1 address. A name is public, like a phone number: anyone can look up the address
///         it points to. Balances and history behind that address stay private in the vault.
///
///         Names are 4 to 20 characters of a-z, 0-9 and single hyphens (not at the start or end).
///         One name per address. Names of 3 characters or fewer, and names on the reserved list,
///         can only be given out by the owner. Claims are free on testnet and go through the relayer.
contract HagiNames is Ownable {
    /// @dev keccak256(name) => the 64 address bytes (spending public key, then encryption public key)
    mapping(bytes32 => bytes) private _addrOf;
    /// @dev keccak256(address bytes) => name
    mapping(bytes32 => string) private _nameOf;
    mapping(bytes32 => bool) public reserved;
    uint256 public count;

    event NameClaimed(string name, bytes addr);
    event NameReleased(string name, bytes addr);

    error BadName();
    error BadAddress();
    error Taken();
    error Reserved();
    error AddressHasName();

    constructor(address owner_) Ownable(owner_) {}

    function claim(string calldata name, bytes calldata addr) external {
        if (!valid(name)) revert BadName();
        bytes32 h = keccak256(bytes(name));
        if (bytes(name).length <= 3 || reserved[h]) revert Reserved();
        _claim(name, h, addr);
    }

    /// @notice Give out a short or reserved name.
    function grant(string calldata name, bytes calldata addr) external onlyOwner {
        if (!valid(name) && !(bytes(name).length >= 1 && bytes(name).length <= 3 && _chars(bytes(name)))) revert BadName();
        _claim(name, keccak256(bytes(name)), addr);
    }

    /// @notice Free a name that breaks the rules (impersonation, abuse). Its address can claim again.
    function release(string calldata name) external onlyOwner {
        bytes32 h = keccak256(bytes(name));
        bytes memory a = _addrOf[h];
        if (a.length == 0) return;
        delete _nameOf[keccak256(a)];
        delete _addrOf[h];
        count--;
        emit NameReleased(name, a);
    }

    function setReserved(string[] calldata names, bool on) external onlyOwner {
        for (uint256 i; i < names.length; i++) reserved[keccak256(bytes(names[i]))] = on;
    }

    function addrOf(string calldata name) external view returns (bytes memory) {
        return _addrOf[keccak256(bytes(name))];
    }

    function nameOf(bytes calldata addr) external view returns (string memory) {
        return _nameOf[keccak256(addr)];
    }

    function available(string calldata name) external view returns (bool) {
        bytes32 h = keccak256(bytes(name));
        return valid(name) && bytes(name).length > 3 && !reserved[h] && _addrOf[h].length == 0;
    }

    function valid(string calldata name) public pure returns (bool) {
        bytes memory b = bytes(name);
        if (b.length < 4 || b.length > 20) return false;
        return _chars(b);
    }

    function _chars(bytes memory b) private pure returns (bool) {
        for (uint256 i; i < b.length; i++) {
            bytes1 c = b[i];
            bool ok = (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39);
            if (c == 0x2d) {
                if (i == 0 || i == b.length - 1 || b[i - 1] == 0x2d) return false;
                ok = true;
            }
            if (!ok) return false;
        }
        return true;
    }

    function _claim(string calldata name, bytes32 h, bytes calldata addr) private {
        if (addr.length != 64) revert BadAddress();
        if (_addrOf[h].length != 0) revert Taken();
        bytes32 ah = keccak256(addr);
        if (bytes(_nameOf[ah]).length != 0) revert AddressHasName();
        _addrOf[h] = addr;
        _nameOf[ah] = name;
        count++;
        emit NameClaimed(name, addr);
    }
}
