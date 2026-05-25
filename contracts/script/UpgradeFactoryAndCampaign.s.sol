// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {FundarcCampaign} from "../src/FundarcCampaign.sol";
import {FundarcFactory} from "../src/FundarcFactory.sol";

contract UpgradeFactoryAndCampaign is Script {
    function run() external {
        address factoryProxy = vm.envAddress("FACTORY_PROXY");

        vm.startBroadcast();

        address sender = msg.sender;
        FundarcFactory factory = FundarcFactory(factoryProxy);
        address currentOwner = factory.owner();
        require(currentOwner == sender, "SENDER_NOT_FACTORY_OWNER");

        address previousUsdc = factory.usdc();
        address previousCampaignImpl = factory.campaignImplementation();
        uint16 previousFeeBps = factory.feeBps();
        address previousFeeTreasury = factory.feeTreasury();
        uint256 previousMinGoal = factory.minimumCampaignGoal();
        uint256 previousCreationFee = factory.campaignCreationFee();
        uint40 previousFundingPeriod = factory.defaultFundingPeriod();
        bool previousCreationPaused = factory.campaignCreationPaused();
        uint256 previousCampaignCount = factory.campaignsCount();

        FundarcFactory newFactoryImpl = new FundarcFactory();
        FundarcCampaign newCampaignImpl = new FundarcCampaign();

        console2.log("FactoryProxy:", factoryProxy);
        console2.log("Owner:", currentOwner);
        console2.log("PreviousCampaignImplementation:", previousCampaignImpl);
        console2.log("NewFactoryImplementation:", address(newFactoryImpl));
        console2.log("NewCampaignImplementation:", address(newCampaignImpl));

        (bool ok1, bytes memory ret1) = factoryProxy.call(
            abi.encodeWithSignature("upgradeToAndCall(address,bytes)", address(newFactoryImpl), bytes(""))
        );
        require(ok1, _getRevertMsg(ret1));

        FundarcFactory upgradedFactory = FundarcFactory(factoryProxy);
        upgradedFactory.setCampaignImplementation(address(newCampaignImpl));

        require(upgradedFactory.owner() == currentOwner, "OWNER_CHANGED");
        require(upgradedFactory.usdc() == previousUsdc, "USDC_CHANGED");
        require(upgradedFactory.feeBps() == previousFeeBps, "FEE_BPS_CHANGED");
        require(upgradedFactory.feeTreasury() == previousFeeTreasury, "FEE_TREASURY_CHANGED");
        require(upgradedFactory.minimumCampaignGoal() == previousMinGoal, "MIN_GOAL_CHANGED");
        require(upgradedFactory.campaignCreationFee() == previousCreationFee, "CREATION_FEE_CHANGED");
        require(upgradedFactory.defaultFundingPeriod() == previousFundingPeriod, "FUNDING_PERIOD_CHANGED");
        require(upgradedFactory.campaignCreationPaused() == previousCreationPaused, "CREATION_PAUSE_CHANGED");
        require(upgradedFactory.campaignsCount() == previousCampaignCount, "CAMPAIGN_COUNT_CHANGED");
        require(upgradedFactory.campaignImplementation() == address(newCampaignImpl), "CAMPAIGN_IMPL_NOT_UPDATED");

        vm.stopBroadcast();

        console2.log("campaignImplementation now:", upgradedFactory.campaignImplementation());
        console2.log("campaignsCount preserved:", previousCampaignCount);
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
