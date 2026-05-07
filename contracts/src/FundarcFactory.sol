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
    event CampaignCreated(address indexed creator, address indexed campaign, uint256 indexed campaignId);
    event FeeConfigUpdated(uint16 feeBps, address feeTreasury);
    event MinimumCampaignGoalUpdated(uint256 minimumCampaignGoal);

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
        emit FeeConfigUpdated(_feeBps, _feeTreasury);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function campaignsCount() external view returns (uint256) {
        return campaigns.length;
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
        uint256 totalGoal = 0;
        for (uint256 i = 0; i < milestoneAmounts.length; i++) {
            totalGoal += uint256(milestoneAmounts[i]);
        }
        require(totalGoal >= minimumCampaignGoal, "GOAL_TOO_LOW");

        campaign = Clones.clone(campaignImplementation);

        FundarcCampaign(campaign)
            .initialize(
                msg.sender, usdc, address(this), title, description, milestoneAmounts, votingPeriod, quorumBps, passBps
            );

        campaigns.push(campaign);
        emit CampaignCreated(msg.sender, campaign, campaigns.length - 1);
    }
}
