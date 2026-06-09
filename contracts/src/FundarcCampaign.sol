// SPDX-License-Identifier: MIT

// contracts/src/FundarcCampaign.sol

pragma solidity ^0.8.24;

import {Initializable} from "openzeppelin-contracts-upgradeable/proxy/utils/Initializable.sol";
import {ReentrancyGuardUpgradeable} from "openzeppelin-contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {OwnableUpgradeable} from "openzeppelin-contracts-upgradeable/access/OwnableUpgradeable.sol";

import {IERC20Minimal} from "./interfaces/IERC20Minimal.sol";

interface IFundarcFactory {
    function feeBps() external view returns (uint16);
    function takeFee(uint256 feeAmount) external returns (bool);
    function clearCreatorActiveCampaign(address creator) external;
}

contract FundarcCampaign is Initializable, ReentrancyGuardUpgradeable, OwnableUpgradeable {
    uint256 public constant MAX_MILESTONES = 12;
    uint256 public constant MAX_TITLE_BYTES = 96;
    uint256 public constant MAX_DESCRIPTION_BYTES = 2_000;
    uint40 public constant MAX_VOTING_PERIOD = 30 days;
    uint256 public constant MINIMUM_CONTRIBUTION = 10 * 1e6;

    enum CampaignState {
        Active,
        Canceled,
        Failed,
        Successful
    }

    enum MilestoneState {
        PendingSubmission,
        Voting,
        Approved,
        Rejected,
        Finalized
    }

    struct Milestone {
        uint96 amount;
        uint40 voteStart;
        uint40 voteEnd;
        MilestoneState state;
        bytes32 evidenceHash;
        uint128 yesWeight;
        uint128 noWeight;
    }

    event Contributed(address indexed funder, uint256 amount);
    event Refunded(address indexed funder, uint256 amount);
    event Canceled();
    event MilestoneSubmitted(uint256 indexed index, bytes32 evidenceHash, uint40 voteStart, uint40 voteEnd);
    event MilestoneEvidenceURIUpdated(uint256 indexed index, string evidenceURI);
    event Voted(address indexed funder, uint256 indexed index, bool support, uint256 weight);
    event VoteDelegateUpdated(address indexed funder, address indexed delegate);
    event MilestoneFinalized(uint256 indexed index, bool approved);
    event Withdrawn(address indexed creator, uint256 amount);
    event FeePaid(address indexed factory, uint256 feeAmount);

    IERC20Minimal public usdc;
    address public creator;
    address public factory; // NEW

    string public title;
    string public description;

    CampaignState public campaignState;

    uint256 public totalRaised;
    uint256 public totalRefunded;
    uint256 public totalWithdrawn;

    uint256 public unlockedAmount;

    mapping(address => uint256) public contributed;
    mapping(address => uint256) public refunded;

    Milestone[] public milestones;
    uint256 public currentMilestone;
    mapping(uint256 => string) public milestoneEvidenceURI;

    mapping(uint256 => mapping(address => uint8)) public voteChoice;
    mapping(address => address) public voteDelegate;

    uint40 public votingPeriod;
    uint16 public quorumBps;
    uint16 public passBps;
    uint40 public createdAt;
    uint40 public fundingDeadline;
    uint256 public selfFundedAmount;
    uint256 public externalRaised;
    uint256 public uniqueContributors;
    uint256 public externalContributors;

    modifier onlyCreator() {
        require(msg.sender == creator, "NOT_CREATOR");
        _;
    }

    modifier inState(CampaignState s) {
        require(campaignState == s, "BAD_CAMPAIGN_STATE");
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _creator,
        address _usdc,
        address _factory, // NEW
        string calldata _title,
        string calldata _description,
        uint96[] calldata milestoneAmounts,
        uint40 _votingPeriod,
        uint16 _quorumBps,
        uint16 _passBps,
        uint40 _fundingPeriod
    ) external initializer {
        require(_creator != address(0), "BAD_CREATOR");
        require(_usdc != address(0), "BAD_USDC");
        require(_factory != address(0), "BAD_FACTORY");
        require(bytes(_title).length > 0 && bytes(_title).length <= MAX_TITLE_BYTES, "BAD_TITLE");
        require(
            bytes(_description).length > 0 && bytes(_description).length <= MAX_DESCRIPTION_BYTES, "BAD_DESCRIPTION"
        );
        require(milestoneAmounts.length > 0 && milestoneAmounts.length <= MAX_MILESTONES, "BAD_MILESTONES");
        require(_votingPeriod >= 1 hours && _votingPeriod <= MAX_VOTING_PERIOD, "BAD_VOTING_PERIOD");
        require(_quorumBps <= 10_000 && _passBps <= 10_000, "BPS");

        __ReentrancyGuard_init();
        __Ownable_init(_creator);

        creator = _creator;
        usdc = IERC20Minimal(_usdc);
        factory = _factory;

        title = _title;
        description = _description;

        votingPeriod = _votingPeriod;
        quorumBps = _quorumBps;
        passBps = _passBps;
        createdAt = uint40(block.timestamp);
        fundingDeadline = _fundingPeriod == 0 ? 0 : uint40(block.timestamp) + _fundingPeriod;

        campaignState = CampaignState.Active;

        for (uint256 i = 0; i < milestoneAmounts.length; i++) {
            require(milestoneAmounts[i] > 0, "ZERO_MS");
            milestones.push(
                Milestone({
                    amount: milestoneAmounts[i],
                    voteStart: 0,
                    voteEnd: 0,
                    state: MilestoneState.PendingSubmission,
                    evidenceHash: bytes32(0),
                    yesWeight: 0,
                    noWeight: 0
                })
            );
        }
    }

    function milestoneCount() external view returns (uint256) {
        return milestones.length;
    }

    function getMilestone(uint256 index) external view returns (Milestone memory) {
        return milestones[index];
    }

    function availableToWithdraw() public view returns (uint256) {
        if (unlockedAmount <= totalWithdrawn) return 0;
        return unlockedAmount - totalWithdrawn;
    }

    function refundableOf(address funder) public view returns (uint256) {
        if (campaignState == CampaignState.Active || campaignState == CampaignState.Successful) {
            return 0;
        }
        uint256 net = contributed[funder];
        if (net <= refunded[funder]) return 0;
        return net - refunded[funder];
    }

    function currentMilestoneState() external view returns (MilestoneState) {
        return milestones[currentMilestone].state;
    }

    function contribute(uint256 amount) external nonReentrant inState(CampaignState.Active) {
        require(amount >= MINIMUM_CONTRIBUTION, "CONTRIBUTION_TOO_LOW");
        require(fundingDeadline == 0 || block.timestamp <= fundingDeadline, "FUNDING_CLOSED");
        require(usdc.transferFrom(msg.sender, address(this), amount), "TRANSFER_FROM_FAIL");

        bool firstContribution = contributed[msg.sender] == 0;
        contributed[msg.sender] += amount;
        totalRaised += amount;

        if (firstContribution) {
            uniqueContributors += 1;
        }

        if (msg.sender == creator) {
            selfFundedAmount += amount;
        } else {
            externalRaised += amount;
            if (firstContribution) {
                externalContributors += 1;
            }
        }

        emit Contributed(msg.sender, amount);
    }

    function cancel() external onlyCreator inState(CampaignState.Active) {
        require(totalRaised == 0, "CAMPAIGN_FUNDED");
        campaignState = CampaignState.Canceled;
        _clearCreatorActiveCampaign();
        emit Canceled();
    }

    function submitMilestone(bytes32 evidenceHash) external onlyCreator inState(CampaignState.Active) {
        _submitMilestone(evidenceHash, "");
    }

    function submitMilestoneWithEvidence(bytes32 evidenceHash, string calldata evidenceURI)
        external
        onlyCreator
        inState(CampaignState.Active)
    {
        require(bytes(evidenceURI).length > 0 && bytes(evidenceURI).length <= MAX_DESCRIPTION_BYTES, "BAD_EVIDENCE_URI");
        _submitMilestone(evidenceHash, evidenceURI);
    }

    function _submitMilestone(bytes32 evidenceHash, string memory evidenceURI) internal {
        Milestone storage m = milestones[currentMilestone];
        require(m.state == MilestoneState.PendingSubmission, "NOT_PENDING");
        require(totalRaised >= unlockedAmount + uint256(m.amount), "MILESTONE_FUNDS_NOT_AVAILABLE");

        uint40 start = uint40(block.timestamp);
        uint40 end = start + votingPeriod;

        m.evidenceHash = evidenceHash;
        m.voteStart = start;
        m.voteEnd = end;
        m.state = MilestoneState.Voting;

        if (bytes(evidenceURI).length > 0) {
            milestoneEvidenceURI[currentMilestone] = evidenceURI;
            emit MilestoneEvidenceURIUpdated(currentMilestone, evidenceURI);
        }

        emit MilestoneSubmitted(currentMilestone, evidenceHash, start, end);
    }

    function setVoteDelegate(address delegate) external inState(CampaignState.Active) {
        require(delegate != msg.sender, "SELF_DELEGATE");
        voteDelegate[msg.sender] = delegate;
        emit VoteDelegateUpdated(msg.sender, delegate);
    }

    function vote(uint256 milestoneIndex, bool support) external nonReentrant inState(CampaignState.Active) {
        _voteFor(msg.sender, milestoneIndex, support);
    }

    function voteFor(address funder, uint256 milestoneIndex, bool support) external nonReentrant inState(CampaignState.Active) {
        require(funder != address(0), "BAD_FUNDER");
        require(voteDelegate[funder] == msg.sender, "NOT_DELEGATE");
        _voteFor(funder, milestoneIndex, support);
    }

    function _voteFor(address funder, uint256 milestoneIndex, bool support) internal {
        require(milestoneIndex == currentMilestone, "NOT_CURRENT");

        Milestone storage m = milestones[milestoneIndex];
        require(m.state == MilestoneState.Voting, "NOT_VOTING");
        require(block.timestamp >= m.voteStart && block.timestamp < m.voteEnd, "VOTE_CLOSED");
        require(voteChoice[milestoneIndex][funder] == 0, "ALREADY_VOTED");

        uint256 weight = funder == creator ? 0 : contributed[funder];
        require(weight > 0, "NO_WEIGHT");

        voteChoice[milestoneIndex][funder] = support ? 1 : 2;

        if (support) m.yesWeight += uint128(weight);
        else m.noWeight += uint128(weight);

        emit Voted(funder, milestoneIndex, support, weight);
    }

    function finalizeMilestone(uint256 milestoneIndex) external nonReentrant inState(CampaignState.Active) {
        require(milestoneIndex == currentMilestone, "NOT_CURRENT");
        Milestone storage m = milestones[milestoneIndex];

        require(m.state == MilestoneState.Voting, "NOT_VOTING");
        require(block.timestamp >= m.voteEnd, "VOTE_NOT_ENDED");

        uint256 participated = uint256(m.yesWeight) + uint256(m.noWeight);

        bool quorumMet = (externalRaised > 0) && (participated * 10_000 >= externalRaised * quorumBps);

        bool approved = false;
        if (participated > 0) {
            approved = quorumMet && (uint256(m.yesWeight) * 10_000 >= participated * passBps);
        }

        if (approved) {
            m.state = MilestoneState.Approved;

            unlockedAmount += uint256(m.amount);

            m.state = MilestoneState.Finalized;

            emit MilestoneFinalized(milestoneIndex, true);

            if (currentMilestone + 1 == milestones.length) {
                campaignState = CampaignState.Successful;
                _clearCreatorActiveCampaign();
            } else {
                currentMilestone += 1;
            }
        } else {
            m.state = MilestoneState.Rejected;
            campaignState = CampaignState.Failed;
            _clearCreatorActiveCampaign();
            emit MilestoneFinalized(milestoneIndex, false);
        }
    }

    function _clearCreatorActiveCampaign() internal {
        try IFundarcFactory(factory).clearCreatorActiveCampaign(creator) {} catch {}
    }

    function withdrawUnlocked(uint256 amount) external nonReentrant onlyCreator {
        require(campaignState == CampaignState.Active || campaignState == CampaignState.Successful, "BAD_STATE");
        uint256 avail = availableToWithdraw();
        require(amount > 0 && amount <= avail, "BAD_AMOUNT");

        // --- fee ---
        uint16 bps = IFundarcFactory(factory).feeBps();
        uint256 fee = (bps == 0) ? 0 : (amount * uint256(bps)) / 10_000;

        totalWithdrawn += amount;

        if (fee > 0) {
            // Factory pulls fee from this campaign via transferFrom(msg.sender,...)
            // so this campaign must approve factory first.
            // IERC20Minimal has no allowance() in your interface, so just approve exact fee each time.
            require(usdc.approve(factory, fee), "FEE_APPROVE_FAIL");
            require(IFundarcFactory(factory).takeFee(fee), "TAKE_FEE_FAIL");
            emit FeePaid(factory, fee);
        }

        uint256 net = amount - fee;
        require(usdc.transfer(creator, net), "TRANSFER_FAIL");

        emit Withdrawn(creator, net);
    }

    function claimRefund() external nonReentrant {
        uint256 amt = refundableOf(msg.sender);
        require(amt > 0, "NOT_REFUNDABLE");

        refunded[msg.sender] += amt;
        totalRefunded += amt;

        require(usdc.transfer(msg.sender, amt), "TRANSFER_FAIL");
        emit Refunded(msg.sender, amt);
    }
}
