// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title ModelLicenses — ERC-1155 licenses (Personal / Commercial / Enterprise) and platform plan passes.
/// @dev id = (modelId << 8) | tier. modelId 0 is reserved for platform subscription passes
///      (tier 1 = Pro, tier 2 = Team). A holder owns at most one token per id; expiry travels with the token.
contract ModelLicenses is ERC1155, AccessControl {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    enum Tier { None, Personal, Commercial, Enterprise }

    /// @dev expiry timestamp per holder+id. 0 means perpetual (only meaningful while balance > 0).
    mapping(address => mapping(uint256 => uint64)) public expiryOf;

    event LicenseIssued(address indexed to, uint256 indexed modelId, Tier tier, uint64 expiresAt);

    error AlreadyLicensed(address to, uint256 id);
    error InvalidTier();
    error OnlyWholeLicenseTransfer();

    constructor(address admin, string memory uri_) ERC1155(uri_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function licenseId(uint256 modelId, Tier tier) public pure returns (uint256) {
        return (modelId << 8) | uint256(uint8(tier));
    }

    function decodeId(uint256 id) public pure returns (uint256 modelId, Tier tier) {
        modelId = id >> 8;
        tier = Tier(uint8(id & 0xff));
    }

    function issue(address to, uint256 modelId, Tier tier, uint64 duration) external onlyRole(ISSUER_ROLE) {
        if (tier == Tier.None) revert InvalidTier();
        uint256 id = licenseId(modelId, tier);
        uint64 current = expiryOf[to][id];
        bool held = balanceOf(to, id) > 0;

        uint64 newExpiry;
        if (duration == 0) {
            newExpiry = 0; // perpetual
        } else {
            uint64 base = (held && current > block.timestamp) ? current : uint64(block.timestamp);
            newExpiry = base + duration;
        }
        expiryOf[to][id] = newExpiry;
        if (!held) _mint(to, id, 1, "");
        emit LicenseIssued(to, modelId, tier, newExpiry);
    }

    function isLicenseValid(address account, uint256 modelId, Tier tier) public view returns (bool) {
        uint256 id = licenseId(modelId, tier);
        if (balanceOf(account, id) == 0) return false;
        uint64 exp = expiryOf[account][id];
        return exp == 0 || exp > block.timestamp;
    }

    function setURI(string calldata newUri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setURI(newUri);
    }

    /// @dev Keeps the one-per-holder invariant and moves expiry with the token.
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        bool isTransfer = from != address(0) && to != address(0);
        if (isTransfer) {
            for (uint256 i = 0; i < ids.length; i++) {
                if (values[i] != 1) revert OnlyWholeLicenseTransfer();
                if (balanceOf(to, ids[i]) != 0) revert AlreadyLicensed(to, ids[i]);
            }
        }
        super._update(from, to, ids, values);
        if (isTransfer) {
            for (uint256 i = 0; i < ids.length; i++) {
                expiryOf[to][ids[i]] = expiryOf[from][ids[i]];
                delete expiryOf[from][ids[i]];
            }
        }
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
