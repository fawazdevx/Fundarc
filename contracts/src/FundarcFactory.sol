// SPDX-License-Identifier: MIT

// contracts/src/FundarcFactory.sol

pragma solidity ^0.8.24;

import {Initializable} from "openzeppelin-contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "openzeppelin-contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "openzeppelin-contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "openzeppelin-contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import {Clones} from "openzeppelin-contracts/proxy/Clones.sol";

import {FundarcCampaign} from "./FundarcCampaign.sol";
import {IERC20Minimal} from "./interfaces/IERC20Minimal.sol";

contract FundarcFactory is Initializable, UUPSUpgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    uint256 public constant DEFAULT_MINIMUM_CAMPAIGN_GOAL = 100 * 1e6;
    uint256 public constant DEFAULT_CAMPAIGN_CREATION_FEE = 10 * 1e6;
    uint40 public constant DEFAULT_FUNDING_PERIOD = 30 days;
    uint256 public constant MAX_MILESTONES = 12;
    uint256 public constant MAX_TITLE_BYTES = 96;
    uint256 public constant MAX_DESCRIPTION_BYTES = 2_000;
    uint40 public constant MAX_VOTING_PERIOD = 30 days;

    event CampaignCreated(address indexed creator, address indexed campaign, uint256 indexed campaignId);
    event FeeConfigUpdated(uint16 feeBps, address feeTreasury);
    event MinimumCampaignGoalUpdated(uint256 minimumCampaignGoal);
    event CampaignCreationPausedUpdated(bool paused);
    event CampaignCreationFeeUpdated(uint256 campaignCreationFee);
    event CampaignCreationFeePaid(address indexed creator, uint256 feeAmount);
    event DefaultFundingPeriodUpdated(uint40 defaultFundingPeriod);
    event CreatorActiveCampaignUpdated(address indexed creator, address indexed campaign);

    /// @notice Emitted whenever protocol fees are collected.
    /// @param campaign The campaign (msg.sender) that paid the fee.
    /// @param feeAmount Amount of USDC paid as fee.
    event FeeTaken(address indexed campaign, uint256 feeAmount);

    address public usdc;
    address public campaignImplementation;

    uint16 public feeBps; // 100 = 1%
    address public feeTreasury;
    uint256 public totalFeesCollected;

    address[] public campaigns;
    uint256 public minimumCampaignGoal;
    bool public campaignCreationPaused;
    uint256 public campaignCreationFee;
    uint40 public defaultFundingPeriod;
    mapping(address => address) public activeCampaignByCreator;

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _owner,
        address _usdc,
        address _campaignImplementation,
        uint16 _feeBps,
        address _feeTreasury
    ) external initializer {
        require(_owner != address(0), "BAD_OWNER");
        require(_usdc != address(0), "BAD_USDC");
        require(_campaignImplementation != address(0), "BAD_IMPL");
        require(_feeBps <= 1_000, "FEE_TOO_HIGH");
        require(_feeTreasury != address(0), "BAD_TREASURY");

        __Ownable_init(_owner);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        usdc = _usdc;
        campaignImplementation = _campaignImplementation;

        feeBps = _feeBps;
        feeTreasury = _feeTreasury;
        minimumCampaignGoal = DEFAULT_MINIMUM_CAMPAIGN_GOAL;
        campaignCreationFee = DEFAULT_CAMPAIGN_CREATION_FEE;
        defaultFundingPeriod = DEFAULT_FUNDING_PERIOD;
        emit FeeConfigUpdated(_feeBps, _feeTreasury);
        emit MinimumCampaignGoalUpdated(DEFAULT_MINIMUM_CAMPAIGN_GOAL);
        emit CampaignCreationFeeUpdated(DEFAULT_CAMPAIGN_CREATION_FEE);
        emit DefaultFundingPeriodUpdated(DEFAULT_FUNDING_PERIOD);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function campaignsCount() external view returns (uint256) {
        return campaigns.length;
    }

    function clearCreatorActiveCampaign(address creator) external {
        if (activeCampaignByCreator[creator] != msg.sender) return;
        delete activeCampaignByCreator[creator];
        emit CreatorActiveCampaignUpdated(creator, address(0));
    }

    function setCreatorActiveCampaign(address creator, address campaign) external onlyOwner {
        require(creator != address(0), "BAD_CREATOR");

        if (campaign != address(0)) {
            require(FundarcCampaign(campaign).creator() == creator, "CREATOR_MISMATCH");
            require(FundarcCampaign(campaign).campaignState() == FundarcCampaign.CampaignState.Active, "NOT_ACTIVE");
        }

        activeCampaignByCreator[creator] = campaign;
        emit CreatorActiveCampaignUpdated(creator, campaign);
    }

    function setCampaignImplementation(address impl) external onlyOwner {
        require(impl != address(0), "BAD_IMPL");
        campaignImplementation = impl;
    }

    function setFeeConfig(uint16 _feeBps, address _feeTreasury) external onlyOwner {
        require(_feeBps <= 1_000, "FEE_TOO_HIGH");
        require(_feeTreasury != address(0), "BAD_TREASURY");
        feeBps = _feeBps;
        feeTreasury = _feeTreasury;
        emit FeeConfigUpdated(_feeBps, _feeTreasury);
    }

    function setMinimumCampaignGoal(uint256 _minimumCampaignGoal) external onlyOwner {
        minimumCampaignGoal = _minimumCampaignGoal;
        emit MinimumCampaignGoalUpdated(_minimumCampaignGoal);
    }

    function setCampaignCreationPaused(bool paused) external onlyOwner {
        campaignCreationPaused = paused;
        emit CampaignCreationPausedUpdated(paused);
    }

    function setCampaignCreationFee(uint256 _campaignCreationFee) external onlyOwner {
        campaignCreationFee = _campaignCreationFee;
        emit CampaignCreationFeeUpdated(_campaignCreationFee);
    }

    function setDefaultFundingPeriod(uint40 _defaultFundingPeriod) external onlyOwner {
        require(_defaultFundingPeriod == 0 || _defaultFundingPeriod >= 1 days, "FUNDING_PERIOD_TOO_SHORT");
        defaultFundingPeriod = _defaultFundingPeriod;
        emit DefaultFundingPeriodUpdated(_defaultFundingPeriod);
    }

    function takeFee(uint256 feeAmount) external nonReentrant returns (bool) {
        if (feeAmount == 0) return true;

        require(IERC20Minimal(usdc).transferFrom(msg.sender, feeTreasury, feeAmount), "FEE_TRANSFER_FAIL");
        totalFeesCollected += feeAmount;

        emit FeeTaken(msg.sender, feeAmount);
        return true;
    }

    function createCampaign(
        string calldata title,
        string calldata description,
        uint96[] calldata milestoneAmounts,
        uint40 votingPeriod,
        uint16 quorumBps,
        uint16 passBps
    ) external nonReentrant returns (address campaign) {
        require(!campaignCreationPaused, "CREATION_PAUSED");
        address activeCampaign = activeCampaignByCreator[msg.sender];
        if (activeCampaign != address(0)) {
            try FundarcCampaign(activeCampaign).campaignState() returns (FundarcCampaign.CampaignState state) {
                require(state != FundarcCampaign.CampaignState.Active, "ACTIVE_CAMPAIGN_EXISTS");
                delete activeCampaignByCreator[msg.sender];
                emit CreatorActiveCampaignUpdated(msg.sender, address(0));
            } catch {
                revert("ACTIVE_CAMPAIGN_EXISTS");
            }
        }
        require(bytes(title).length > 0 && bytes(title).length <= MAX_TITLE_BYTES, "BAD_TITLE");
        require(bytes(description).length > 0 && bytes(description).length <= MAX_DESCRIPTION_BYTES, "BAD_DESCRIPTION");
        require(milestoneAmounts.length > 0 && milestoneAmounts.length <= MAX_MILESTONES, "BAD_MILESTONES");
        require(votingPeriod >= 1 hours && votingPeriod <= MAX_VOTING_PERIOD, "BAD_VOTING_PERIOD");
        require(quorumBps <= 10_000 && passBps <= 10_000, "BPS");

        uint256 totalGoal = 0;
        for (uint256 i = 0; i < milestoneAmounts.length; i++) {
            totalGoal += uint256(milestoneAmounts[i]);
        }
        require(totalGoal >= minimumCampaignGoal, "GOAL_TOO_LOW");

        if (campaignCreationFee > 0) {
            require(IERC20Minimal(usdc).transferFrom(msg.sender, feeTreasury, campaignCreationFee), "CREATION_FEE_FAIL");
            totalFeesCollected += campaignCreationFee;
            emit CampaignCreationFeePaid(msg.sender, campaignCreationFee);
        }

        campaign = Clones.clone(campaignImplementation);

        FundarcCampaign(campaign)
            .initialize(
                msg.sender,
                usdc,
                address(this),
                title,
                description,
                milestoneAmounts,
                votingPeriod,
                quorumBps,
                passBps,
                defaultFundingPeriod
            );

        campaigns.push(campaign);
        activeCampaignByCreator[msg.sender] = campaign;
        emit CampaignCreated(msg.sender, campaign, campaigns.length - 1);
        emit CreatorActiveCampaignUpdated(msg.sender, campaign);
    }
}
