// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {FundarcCampaign} from "../src/FundarcCampaign.sol";
import {FundarcFactory} from "../src/FundarcFactory.sol";

contract UpgradeFee is Script {
    uint256 internal constant DEFAULT_MIN_CAMPAIGN_GOAL = 100 * 1e6;
    uint256 internal constant DEFAULT_CREATION_FEE = 10 * 1e6;
    uint40 internal constant DEFAULT_FUNDING_PERIOD = 30 days;

    function run() external {
        address factoryProxy = vm.envAddress("FACTORY_PROXY");
        uint256 minCampaignGoal = vm.envOr("MIN_CAMPAIGN_GOAL", DEFAULT_MIN_CAMPAIGN_GOAL);
        uint256 campaignCreationFee = vm.envOr("CAMPAIGN_CREATION_FEE", DEFAULT_CREATION_FEE);
        uint40 defaultFundingPeriod = uint40(vm.envOr("DEFAULT_FUNDING_PERIOD", uint256(DEFAULT_FUNDING_PERIOD)));
        bool creationPaused = vm.envOr("CAMPAIGN_CREATION_PAUSED", false);

        vm.startBroadcast();

        // --- pre-check: ensure upgrader is owner ---
        address sender = msg.sender; // in a broadcasted call this will be your EOA
        address currentOwner = FundarcFactory(factoryProxy).owner();
        require(currentOwner == sender, "SENDER_NOT_FACTORY_OWNER");

        console2.log("FactoryProxy:", factoryProxy);
        console2.log("Owner:", currentOwner);

        // 1) Deploy new implementations
        FundarcCampaign newCampaignImpl = new FundarcCampaign();
        FundarcFactory newFactoryImpl = new FundarcFactory();

        console2.log("NewCampaignImplementation (deployed):", address(newCampaignImpl));
        console2.log("NewFactoryImplementation (deployed):", address(newFactoryImpl));

        // 2) Upgrade proxy -> new factory impl (no re-init)
        (bool ok1, bytes memory ret1) = factoryProxy.call(
            abi.encodeWithSignature("upgradeToAndCall(address,bytes)", address(newFactoryImpl), bytes(""))
        );
        require(ok1, _getRevertMsg(ret1));

        // 3) Point factory to new campaign impl
        (bool ok2, bytes memory ret2) =
            factoryProxy.call(abi.encodeWithSignature("setCampaignImplementation(address)", address(newCampaignImpl)));
        require(ok2, _getRevertMsg(ret2));

        // 4) Enforce a minimum total milestone goal for new campaigns.
        (bool ok3, bytes memory ret3) =
            factoryProxy.call(abi.encodeWithSignature("setMinimumCampaignGoal(uint256)", minCampaignGoal));
        require(ok3, _getRevertMsg(ret3));

        // 5) Configure anti-spam controls for new campaigns.
        (bool ok4, bytes memory ret4) =
            factoryProxy.call(abi.encodeWithSignature("setCampaignCreationFee(uint256)", campaignCreationFee));
        require(ok4, _getRevertMsg(ret4));

        (bool ok5, bytes memory ret5) =
            factoryProxy.call(abi.encodeWithSignature("setDefaultFundingPeriod(uint40)", defaultFundingPeriod));
        require(ok5, _getRevertMsg(ret5));

        (bool ok6, bytes memory ret6) =
            factoryProxy.call(abi.encodeWithSignature("setCampaignCreationPaused(bool)", creationPaused));
        require(ok6, _getRevertMsg(ret6));

        // 6) Post-check: confirm it updated
        address implNow = FundarcFactory(factoryProxy).campaignImplementation();
        require(implNow == address(newCampaignImpl), "CAMPAIGN_IMPL_NOT_UPDATED");
        uint256 minGoalNow = FundarcFactory(factoryProxy).minimumCampaignGoal();
        require(minGoalNow == minCampaignGoal, "MIN_GOAL_NOT_UPDATED");
        uint256 creationFeeNow = FundarcFactory(factoryProxy).campaignCreationFee();
        require(creationFeeNow == campaignCreationFee, "CREATION_FEE_NOT_UPDATED");
        uint40 fundingPeriodNow = FundarcFactory(factoryProxy).defaultFundingPeriod();
        require(fundingPeriodNow == defaultFundingPeriod, "FUNDING_PERIOD_NOT_UPDATED");
        bool pausedNow = FundarcFactory(factoryProxy).campaignCreationPaused();
        require(pausedNow == creationPaused, "CREATION_PAUSE_NOT_UPDATED");

        vm.stopBroadcast();

        console2.log("campaignImplementation now:", implNow);
        console2.log("minimumCampaignGoal now:", minGoalNow);
        console2.log("campaignCreationFee now:", creationFeeNow);
        console2.log("defaultFundingPeriod now:", fundingPeriodNow);
        console2.log("campaignCreationPaused now:", pausedNow);
        console2.log("Upgrade complete.");
    }

    function _getRevertMsg(bytes memory returnData) internal pure returns (string memory) {
        if (returnData.length < 68) return "TX_REVERTED";
        assembly {
            returnData := add(returnData, 0x04)
        }
        return abi.decode(returnData, (string));
    }
}
