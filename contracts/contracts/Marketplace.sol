// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ModelNFT} from "./ModelNFT.sol";
import {ModelLicenses} from "./ModelLicenses.sol";

/// @title Marketplace — license sales, prepaid pay-per-use metering, subscriptions and royalty accounting.
/// @dev Revenue is never pushed: every payee accrues a `pending` balance and pulls it with `claim()`
///      (pull-payment pattern + ReentrancyGuard). The API gateway (GATEWAY_ROLE) records usage on-chain.
contract Marketplace is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant GATEWAY_ROLE = keccak256("GATEWAY_ROLE");

    uint16 public constant BPS = 10_000;
    uint16 public constant MAX_PARTNER_BPS = 5_000;
    uint64 public constant LICENSE_TERM = 365 days;

    enum Plan { None, Pro, Team }

    struct Pricing {
        uint128 personal;
        uint128 commercial;
        uint128 enterprise;
        uint128 perCall; // price of one API call, in payment-token base units
        bool listed;
    }

    struct Split {
        address partner;
        uint16 partnerBps; // share of gross revenue routed to the compute partner
    }

    IERC20 public immutable payToken;
    ModelNFT public immutable models;
    ModelLicenses public immutable licenses;
    address public treasury;
    uint16 public platformFeeBps = 1_000; // 10%

    uint256 public proMonthly = 29e6;
    uint256 public teamMonthly = 79e6;
    uint16 public annualDiscountBps = 2_000; // 20% off when billed annually

    mapping(uint256 => Pricing) private _pricing;
    mapping(uint256 => Split) private _splits;

    mapping(address => uint256) public pending; // claimable revenue
    mapping(address => uint256) public credits; // prepaid pay-per-use escrow
    mapping(address => mapping(uint256 => uint256)) public callsOf; // user => modelId => calls
    mapping(uint256 => uint256) public totalCalls;
    mapping(uint256 => uint256) public totalRevenue;
    mapping(bytes32 => bool) public processedBatch;

    event ModelListed(uint256 indexed modelId, Pricing pricing);
    event RevenueSplitSet(uint256 indexed modelId, address partner, uint16 partnerBps);
    event LicensePurchased(address indexed buyer, uint256 indexed modelId, ModelLicenses.Tier tier, uint256 price, uint64 expiresAt);
    event PlanSubscribed(address indexed account, Plan plan, bool annual, uint256 price, uint64 expiresAt);
    event CreditsDeposited(address indexed account, uint256 amount);
    event CreditsWithdrawn(address indexed account, uint256 amount);
    event UsageRecorded(bytes32 indexed batchId, uint256 indexed modelId, address indexed user, uint256 calls, uint256 cost);
    event RevenueDistributed(uint256 indexed modelId, address owner, uint256 ownerShare, address partner, uint256 partnerShare, uint256 platformShare);
    event Claimed(address indexed account, uint256 amount);

    error NotModelOwner();
    error NotForSale();
    error InvalidSplit();
    error InvalidTier();
    error ZeroAmount();
    error InsufficientCredits(address user, uint256 have, uint256 need);
    error BatchAlreadyProcessed(bytes32 batchId);
    error NothingToClaim();

    constructor(
        address admin,
        address treasury_,
        IERC20 payToken_,
        ModelNFT models_,
        ModelLicenses licenses_
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        treasury = treasury_;
        payToken = payToken_;
        models = models_;
        licenses = licenses_;
    }

    // ───────────────────────── creator configuration ─────────────────────────

    function listModel(uint256 modelId, Pricing calldata p) external {
        if (models.ownerOf(modelId) != msg.sender) revert NotModelOwner();
        _pricing[modelId] = Pricing(p.personal, p.commercial, p.enterprise, p.perCall, true);
        emit ModelListed(modelId, _pricing[modelId]);
    }

    function setRevenueSplit(uint256 modelId, address partner, uint16 partnerBps) external {
        if (models.ownerOf(modelId) != msg.sender) revert NotModelOwner();
        if (partnerBps > MAX_PARTNER_BPS || (partnerBps > 0 && partner == address(0))) revert InvalidSplit();
        _splits[modelId] = Split(partner, partnerBps);
        emit RevenueSplitSet(modelId, partner, partnerBps);
    }

    // ───────────────────────────── licenses ─────────────────────────────

    function buyLicense(uint256 modelId, ModelLicenses.Tier tier) external nonReentrant {
        _buyLicense(modelId, tier);
    }

    /// @notice Single-transaction purchase using an EIP-2612 permit (no separate approve tx).
    function buyLicenseWithPermit(
        uint256 modelId,
        ModelLicenses.Tier tier,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        uint256 price = _priceOf(modelId, tier);
        _tryPermit(price, deadline, v, r, s);
        _buyLicense(modelId, tier);
    }

    function _buyLicense(uint256 modelId, ModelLicenses.Tier tier) private {
        uint256 price = _priceOf(modelId, tier);
        payToken.safeTransferFrom(msg.sender, address(this), price);
        _distribute(modelId, price);
        uint64 duration = tier == ModelLicenses.Tier.Enterprise ? 0 : LICENSE_TERM;
        licenses.issue(msg.sender, modelId, tier, duration);
        uint64 exp = duration == 0 ? 0 : licenses.expiryOf(msg.sender, licenses.licenseId(modelId, tier));
        emit LicensePurchased(msg.sender, modelId, tier, price, exp);
    }

    function priceOf(uint256 modelId, ModelLicenses.Tier tier) external view returns (uint256) {
        return _priceOf(modelId, tier);
    }

    function _priceOf(uint256 modelId, ModelLicenses.Tier tier) private view returns (uint256 price) {
        Pricing storage p = _pricing[modelId];
        if (!p.listed) revert NotForSale();
        if (tier == ModelLicenses.Tier.Personal) price = p.personal;
        else if (tier == ModelLicenses.Tier.Commercial) price = p.commercial;
        else if (tier == ModelLicenses.Tier.Enterprise) price = p.enterprise;
        else revert InvalidTier();
        if (price == 0) revert NotForSale();
    }

    // ─────────────────────────── subscriptions ───────────────────────────

    function planPrice(Plan plan, bool annual) public view returns (uint256) {
        if (plan == Plan.None) revert InvalidTier();
        uint256 monthly = plan == Plan.Pro ? proMonthly : teamMonthly;
        if (!annual) return monthly;
        return (monthly * 12 * (BPS - annualDiscountBps)) / BPS;
    }

    function subscribe(Plan plan, bool annual) external nonReentrant {
        _subscribe(plan, annual);
    }

    function subscribeWithPermit(Plan plan, bool annual, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
        nonReentrant
    {
        _tryPermit(planPrice(plan, annual), deadline, v, r, s);
        _subscribe(plan, annual);
    }

    function _subscribe(Plan plan, bool annual) private {
        uint256 price = planPrice(plan, annual);
        payToken.safeTransferFrom(msg.sender, address(this), price);
        pending[treasury] += price;
        uint64 duration = annual ? 365 days : 30 days;
        licenses.issue(msg.sender, 0, ModelLicenses.Tier(uint8(plan)), duration);
        uint64 exp = licenses.expiryOf(msg.sender, licenses.licenseId(0, ModelLicenses.Tier(uint8(plan))));
        emit PlanSubscribed(msg.sender, plan, annual, price, exp);
    }

    // ───────────────────────── pay-per-use metering ─────────────────────────

    function depositCredits(uint256 amount) external nonReentrant {
        _deposit(amount);
    }

    function depositCreditsWithPermit(uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
        nonReentrant
    {
        _tryPermit(amount, deadline, v, r, s);
        _deposit(amount);
    }

    function _deposit(uint256 amount) private {
        if (amount == 0) revert ZeroAmount();
        payToken.safeTransferFrom(msg.sender, address(this), amount);
        credits[msg.sender] += amount;
        emit CreditsDeposited(msg.sender, amount);
    }

    function withdrawCredits(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 have = credits[msg.sender];
        if (have < amount) revert InsufficientCredits(msg.sender, have, amount);
        credits[msg.sender] = have - amount;
        payToken.safeTransfer(msg.sender, amount);
        emit CreditsWithdrawn(msg.sender, amount);
    }

    /// @notice Called by the API gateway after serving `calls` requests. `batchId` makes settlement idempotent.
    function recordUsage(bytes32 batchId, uint256 modelId, address user, uint256 calls)
        external
        onlyRole(GATEWAY_ROLE)
        nonReentrant
    {
        if (processedBatch[batchId]) revert BatchAlreadyProcessed(batchId);
        Pricing storage p = _pricing[modelId];
        if (!p.listed || p.perCall == 0) revert NotForSale();
        if (calls == 0) revert ZeroAmount();

        uint256 cost = calls * uint256(p.perCall);
        uint256 have = credits[user];
        if (have < cost) revert InsufficientCredits(user, have, cost);

        processedBatch[batchId] = true;
        credits[user] = have - cost;
        callsOf[user][modelId] += calls;
        totalCalls[modelId] += calls;
        _distribute(modelId, cost);
        emit UsageRecorded(batchId, modelId, user, calls, cost);
    }

    // ───────────────────────────── revenue ─────────────────────────────

    function _distribute(uint256 modelId, uint256 amount) private {
        Split memory sp = _splits[modelId];
        uint256 platformShare = (amount * platformFeeBps) / BPS;
        uint256 partnerShare = sp.partner == address(0) ? 0 : (amount * sp.partnerBps) / BPS;
        uint256 ownerShare = amount - platformShare - partnerShare;
        address owner = models.ownerOf(modelId);

        pending[treasury] += platformShare;
        if (partnerShare > 0) pending[sp.partner] += partnerShare;
        pending[owner] += ownerShare;
        totalRevenue[modelId] += amount;
        emit RevenueDistributed(modelId, owner, ownerShare, sp.partner, partnerShare, platformShare);
    }

    function claim() external nonReentrant returns (uint256 amount) {
        amount = pending[msg.sender];
        if (amount == 0) revert NothingToClaim();
        pending[msg.sender] = 0;
        payToken.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    // ───────────────────────────── views ─────────────────────────────

    function getPricing(uint256 modelId) external view returns (Pricing memory) {
        return _pricing[modelId];
    }

    function getSplit(uint256 modelId) external view returns (Split memory) {
        return _splits[modelId];
    }

    // ───────────────────────────── admin ─────────────────────────────

    function setTreasury(address next) external onlyRole(DEFAULT_ADMIN_ROLE) {
        treasury = next;
    }

    function setPlatformFee(uint16 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > 2_000) revert InvalidSplit();
        platformFeeBps = bps;
    }

    // ───────────────────────────── internals ─────────────────────────────

    /// @dev Permit can be front-run (someone submits the signature first). If the allowance is already
    ///      sufficient we continue instead of reverting, which is the recommended defensive pattern.
    function _tryPermit(uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) private {
        try IERC20Permit(address(payToken)).permit(msg.sender, address(this), value, deadline, v, r, s) {} catch {
            if (payToken.allowance(msg.sender, address(this)) < value) {
                IERC20Permit(address(payToken)).permit(msg.sender, address(this), value, deadline, v, r, s);
            }
        }
    }
}
