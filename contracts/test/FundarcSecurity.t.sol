// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FundarcCampaign} from "../src/FundarcCampaign.sol";
import {FundarcFactory} from "../src/FundarcFactory.sol";
import {ERC1967Proxy} from "openzeppelin-contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract MockUSDC {
    string public constant name = "Mock USDC";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "BALANCE");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "BALANCE");
        require(allowance[from][msg.sender] >= amount, "ALLOWANCE");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract FundarcSecurityTest is Test {
    uint256 internal constant USDC = 1e6;

    address internal owner = address(0xA11CE);
    address internal creator = address(0xC0FFEE);
    address internal funder1 = address(0xF001);
    address internal funder2 = address(0xF002);
    address internal treasury = address(0xFEE);

    MockUSDC internal usdc;
    FundarcFactory internal factory;

    function setUp() external {
        usdc = new MockUSDC();
        FundarcCampaign campaignImpl = new FundarcCampaign();
        FundarcFactory factoryImpl = new FundarcFactory();
        bytes memory initData =
            abi.encodeCall(FundarcFactory.initialize, (owner, address(usdc), address(campaignImpl), 100, treasury));
        factory = FundarcFactory(address(new ERC1967Proxy(address(factoryImpl), initData)));

        usdc.mint(creator, 1_000 * USDC);
        usdc.mint(funder1, 1_000 * USDC);
        usdc.mint(funder2, 1_000 * USDC);

        vm.prank(creator);
        usdc.approve(address(factory), type(uint256).max);
    }

    function testCreateCampaignRejectsLowGoal() external {
        uint96[] memory milestones = _milestones(99 * USDC);

        vm.prank(creator);
        vm.expectRevert("GOAL_TOO_LOW");
        factory.createCampaign("Tiny", "Too small", milestones, 1 days, 2_000, 6_000);
    }

    function testFactoryImplementationCannotBeInitializedDirectly() external {
        FundarcFactory factoryImpl = new FundarcFactory();
        FundarcCampaign campaignImpl = new FundarcCampaign();

        vm.expectRevert();
        factoryImpl.initialize(owner, address(usdc), address(campaignImpl), 100, treasury);
    }

    function testCampaignImplementationCannotBeInitializedDirectly() external {
        FundarcCampaign campaignImpl = new FundarcCampaign();

        vm.expectRevert();
        campaignImpl.initialize(
            creator,
            address(usdc),
            address(factory),
            "Locked implementation",
            "Cannot initialize directly",
            _milestones(100 * USDC),
            1 days,
            2_000,
            6_000,
            1 days
        );
    }

    function testCreateCampaignRejectsTooManyMilestones() external {
        vm.prank(creator);
        vm.expectRevert("BAD_MILESTONES");
        factory.createCampaign("Too many", "Too many milestones", _manyMilestones(13, 100 * USDC), 1 days, 2_000, 6_000);
    }

    function testCreateCampaignRejectsOversizedMetadata() external {
        vm.prank(creator);
        vm.expectRevert("BAD_TITLE");
        factory.createCampaign(_repeat("x", 97), "Valid description", _milestones(100 * USDC), 1 days, 2_000, 6_000);

        vm.prank(creator);
        vm.expectRevert("BAD_DESCRIPTION");
        factory.createCampaign("Valid title", _repeat("x", 2_001), _milestones(100 * USDC), 1 days, 2_000, 6_000);
    }

    function testCreateCampaignRejectsExtremeVotingPeriod() external {
        vm.prank(creator);
        vm.expectRevert("BAD_VOTING_PERIOD");
        factory.createCampaign("Slow vote", "Too long", _milestones(100 * USDC), 31 days, 2_000, 6_000);
    }

    function testCreateCampaignCanBePausedOnchain() external {
        vm.prank(owner);
        factory.setCampaignCreationPaused(true);

        vm.prank(creator);
        vm.expectRevert("CREATION_PAUSED");
        factory.createCampaign("Paused", "Paused", _milestones(100 * USDC), 1 days, 2_000, 6_000);
    }

    function testCreateCampaignChargesCreationFee() external {
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        vm.prank(creator);
        factory.createCampaign("Fee", "Charges fee", _milestones(100 * USDC), 1 days, 2_000, 6_000);

        assertEq(usdc.balanceOf(treasury), treasuryBefore + factory.campaignCreationFee());
        assertEq(factory.totalFeesCollected(), factory.campaignCreationFee());
    }

    function testCreatorCannotCreateAnotherActiveCampaign() external {
        vm.prank(creator);
        address campaignAddress =
            factory.createCampaign("One", "First active", _milestones(100 * USDC), 1 days, 2_000, 6_000);

        assertEq(factory.activeCampaignByCreator(creator), campaignAddress);

        vm.prank(creator);
        vm.expectRevert("ACTIVE_CAMPAIGN_EXISTS");
        factory.createCampaign("Two", "Second active", _milestones(100 * USDC), 1 days, 2_000, 6_000);
    }

    function testCreatorCanCreateAfterCampaignCanceled() external {
        vm.prank(creator);
        address campaignAddress =
            factory.createCampaign("One", "First active", _milestones(100 * USDC), 1 days, 2_000, 6_000);

        vm.prank(creator);
        FundarcCampaign(campaignAddress).cancel();

        assertEq(factory.activeCampaignByCreator(creator), address(0));

        vm.prank(creator);
        address nextCampaign =
            factory.createCampaign("Two", "After cancel", _milestones(100 * USDC), 1 days, 2_000, 6_000);

        assertEq(factory.activeCampaignByCreator(creator), nextCampaign);
    }

    function testCreatorCanCreateAfterCampaignSuccessful() external {
        vm.prank(creator);
        address campaignAddress =
            factory.createCampaign("One", "First active", _milestones(100 * USDC), 1 days, 2_000, 6_000);
        FundarcCampaign campaign = FundarcCampaign(campaignAddress);

        vm.startPrank(funder1);
        usdc.approve(campaignAddress, 100 * USDC);
        campaign.contribute(100 * USDC);
        vm.stopPrank();

        vm.prank(creator);
        campaign.submitMilestone(bytes32("evidence"));

        vm.prank(funder1);
        campaign.vote(0, true);

        vm.warp(block.timestamp + 1 days + 1);
        campaign.finalizeMilestone(0);

        assertEq(uint256(campaign.campaignState()), uint256(FundarcCampaign.CampaignState.Successful));
        assertEq(factory.activeCampaignByCreator(creator), address(0));

        vm.prank(creator);
        address nextCampaign =
            factory.createCampaign("Two", "After success", _milestones(100 * USDC), 1 days, 2_000, 6_000);

        assertEq(factory.activeCampaignByCreator(creator), nextCampaign);
    }

    function testCreatedAtIsSetAtCreationTime() external {
        vm.warp(1_900_000_000);

        vm.prank(creator);
        address campaignAddress =
            factory.createCampaign("Timestamp", "Created at", _milestones(100 * USDC), 1 days, 2_000, 6_000);

        assertEq(FundarcCampaign(campaignAddress).createdAt(), 1_900_000_000);
    }

    function testSubmitMilestoneStoresEvidenceURI() external {
        vm.prank(creator);
        address campaignAddress =
            factory.createCampaign("Proof", "With media evidence", _milestones(100 * USDC), 1 days, 2_000, 6_000);

        vm.startPrank(funder1);
        usdc.approve(campaignAddress, 100 * USDC);
        FundarcCampaign(campaignAddress).contribute(100 * USDC);
        vm.stopPrank();

        vm.prank(creator);
        FundarcCampaign(campaignAddress).submitMilestoneWithEvidence(
            bytes32("evidence"),
            "ipfs://bafybeigdyrztproof"
        );

        assertEq(FundarcCampaign(campaignAddress).milestoneEvidenceURI(0), "ipfs://bafybeigdyrztproof");
    }

    function testSubmitMilestoneRequiresAvailableFunding() external {
        vm.prank(creator);
        address campaignAddress =
            factory.createCampaign("Unfunded", "No milestone funds yet", _milestones(100 * USDC), 1 days, 2_000, 6_000);

        vm.prank(creator);
        vm.expectRevert("MILESTONE_FUNDS_NOT_AVAILABLE");
        FundarcCampaign(campaignAddress).submitMilestone(bytes32("evidence"));
    }

    function testFundingDeadlineBlocksLateContributions() external {
        vm.prank(owner);
        factory.setDefaultFundingPeriod(1 days);

        vm.prank(creator);
        address campaignAddress =
            factory.createCampaign("Deadline", "Deadline", _milestones(100 * USDC), 1 days, 2_000, 6_000);

        vm.warp(block.timestamp + 1 days + 1);
        vm.startPrank(funder1);
        usdc.approve(campaignAddress, 10 * USDC);
        vm.expectRevert("FUNDING_CLOSED");
        FundarcCampaign(campaignAddress).contribute(10 * USDC);
        vm.stopPrank();
    }

    function testContributionRejectsAmountsBelowMinimum() external {
        vm.prank(creator);
        address campaignAddress =
            factory.createCampaign("Minimum", "Minimum contribution", _milestones(100 * USDC), 1 days, 2_000, 6_000);

        vm.startPrank(funder1);
        usdc.approve(campaignAddress, 9 * USDC);
        vm.expectRevert("CONTRIBUTION_TOO_LOW");
        FundarcCampaign(campaignAddress).contribute(9 * USDC);
        vm.stopPrank();
    }

    function testCreatorSelfFundingDoesNotCreateVotingWeight() external {
        vm.prank(creator);
        address campaignAddress =
            factory.createCampaign("Self funded", "Self funded", _milestones(100 * USDC), 1 days, 2_000, 6_000);
        FundarcCampaign campaign = FundarcCampaign(campaignAddress);

        vm.startPrank(creator);
        usdc.approve(campaignAddress, 100 * USDC);
        campaign.contribute(100 * USDC);
        campaign.submitMilestone(bytes32("evidence"));
        vm.expectRevert("NO_WEIGHT");
        campaign.vote(0, true);
        vm.stopPrank();

        assertEq(campaign.selfFundedAmount(), 100 * USDC);
        assertEq(campaign.externalRaised(), 0);
        assertEq(campaign.externalContributors(), 0);
    }

    function testExternalFundingCountsForQuorum() external {
        vm.prank(creator);
        address campaignAddress =
            factory.createCampaign("External", "External", _milestones(100 * USDC), 1 days, 2_000, 6_000);
        FundarcCampaign campaign = FundarcCampaign(campaignAddress);

        vm.startPrank(funder1);
        usdc.approve(campaignAddress, 100 * USDC);
        campaign.contribute(100 * USDC);
        campaign.voteChoice(0, funder1);
        vm.stopPrank();

        vm.prank(creator);
        campaign.submitMilestone(bytes32("evidence"));

        vm.prank(funder1);
        campaign.vote(0, true);

        vm.warp(block.timestamp + 1 days + 1);
        campaign.finalizeMilestone(0);

        assertEq(uint256(campaign.campaignState()), uint256(FundarcCampaign.CampaignState.Successful));
        assertEq(factory.activeCampaignByCreator(creator), address(0));
        assertEq(campaign.externalRaised(), 100 * USDC);
        assertEq(campaign.externalContributors(), 1);
    }

    function testDelegateCanVoteForContributor() external {
        address delegate = address(0xD16E);

        vm.prank(creator);
        address campaignAddress =
            factory.createCampaign("Delegate", "Delegate voting", _milestones(100 * USDC), 1 days, 2_000, 6_000);
        FundarcCampaign campaign = FundarcCampaign(campaignAddress);

        vm.startPrank(funder1);
        usdc.approve(campaignAddress, 100 * USDC);
        campaign.contribute(100 * USDC);
        campaign.setVoteDelegate(delegate);
        vm.stopPrank();

        vm.prank(creator);
        campaign.submitMilestone(bytes32("evidence"));

        vm.prank(delegate);
        campaign.voteFor(funder1, 0, true);

        assertEq(campaign.voteChoice(0, funder1), 1);
    }

    function testDelegateVoteRejectsUnauthorizedCaller() external {
        address delegate = address(0xD16E);

        vm.prank(creator);
        address campaignAddress =
            factory.createCampaign("Delegate", "Delegate voting", _milestones(100 * USDC), 1 days, 2_000, 6_000);
        FundarcCampaign campaign = FundarcCampaign(campaignAddress);

        vm.startPrank(funder1);
        usdc.approve(campaignAddress, 100 * USDC);
        campaign.contribute(100 * USDC);
        campaign.setVoteDelegate(delegate);
        vm.stopPrank();

        vm.prank(creator);
        campaign.submitMilestone(bytes32("evidence"));

        vm.prank(funder2);
        vm.expectRevert("NOT_DELEGATE");
        campaign.voteFor(funder1, 0, true);
    }

    function testDelegateVoteStillBlocksDoubleVoting() external {
        address delegate = address(0xD16E);

        vm.prank(creator);
        address campaignAddress =
            factory.createCampaign("Delegate", "Delegate voting", _milestones(100 * USDC), 1 days, 2_000, 6_000);
        FundarcCampaign campaign = FundarcCampaign(campaignAddress);

        vm.startPrank(funder1);
        usdc.approve(campaignAddress, 100 * USDC);
        campaign.contribute(100 * USDC);
        campaign.setVoteDelegate(delegate);
        vm.stopPrank();

        vm.prank(creator);
        campaign.submitMilestone(bytes32("evidence"));

        vm.prank(delegate);
        campaign.voteFor(funder1, 0, true);

        vm.prank(funder1);
        vm.expectRevert("ALREADY_VOTED");
        campaign.vote(0, false);
    }

    function _milestones(uint256 amount) internal pure returns (uint96[] memory milestones) {
        milestones = new uint96[](1);
        milestones[0] = uint96(amount);
    }

    function _manyMilestones(uint256 count, uint256 totalAmount) internal pure returns (uint96[] memory milestones) {
        milestones = new uint96[](count);
        uint96 amount = uint96(totalAmount / count);
        for (uint256 i = 0; i < count; i++) {
            milestones[i] = amount;
        }
    }

    function _repeat(string memory char, uint256 count) internal pure returns (string memory) {
        bytes memory charBytes = bytes(char);
        bytes memory result = new bytes(count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = charBytes[0];
        }
        return string(result);
    }
}
