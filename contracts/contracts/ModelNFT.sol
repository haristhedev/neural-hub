// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";

/// @title ModelNFT — ERC-721 identity of an AI model (creator, category, version, metadata URI).
/// @dev The *current owner* of the token receives the creator share of marketplace revenue,
///      so transferring the NFT transfers the revenue stream.
contract ModelNFT is ERC721, ERC721Enumerable, ERC721URIStorage, ERC2981 {
    enum Category { LLM, ImageGen, Audio, Video, Predictive, NLP, Security }

    struct ModelInfo {
        address creator;
        Category category;
        uint64 createdAt;
        string version;
    }

    uint256 private _nextId = 1;
    mapping(uint256 => ModelInfo) private _models;

    event ModelMinted(uint256 indexed modelId, address indexed creator, Category category, string uri);
    event ModelVersionUpdated(uint256 indexed modelId, string version, string uri);

    error InvalidRoyalty();
    error NotModelOwner();

    constructor() ERC721("NeuralHub Model", "NHMODEL") {}

    function mintModel(string calldata uri, Category category, string calldata version, uint96 royaltyBps)
        external
        returns (uint256 id)
    {
        if (royaltyBps > 1_000) revert InvalidRoyalty(); // max 10% secondary royalty
        id = _nextId++;
        _safeMint(msg.sender, id);
        _setTokenURI(id, uri);
        _setTokenRoyalty(id, msg.sender, royaltyBps);
        _models[id] = ModelInfo(msg.sender, category, uint64(block.timestamp), version);
        emit ModelMinted(id, msg.sender, category, uri);
    }

    function updateVersion(uint256 id, string calldata version, string calldata uri) external {
        if (ownerOf(id) != msg.sender) revert NotModelOwner();
        _models[id].version = version;
        _setTokenURI(id, uri);
        emit ModelVersionUpdated(id, version, uri);
    }

    function modelInfo(uint256 id) external view returns (ModelInfo memory) {
        _requireOwned(id);
        return _models[id];
    }

    // ---- required overrides ----
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, ERC721URIStorage, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
