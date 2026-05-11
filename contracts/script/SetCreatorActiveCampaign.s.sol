// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {FundarcFactory} from "../src/FundarcFactory.sol";

contract SetCreatorActiveCampaign is Script {
    function run() external {
        address factoryProxy = vm.envAddress("FACTORY_PROXY");
        address creator = vm.envAddress("CREATOR");
        address campaign = vm.envOr("ACTIVE_CAMPAIGN", address(0));

        vm.startBroadcast();

        FundarcFactory factory = FundarcFactory(factoryProxy);
        address sender = msg.sender;
        address currentOwner = factory.owner();
        require(currentOwner == sender, "SENDER_NOT_FACTORY_OWNER");

        factory.setCreatorActiveCampaign(creator, campaign);

        address activeCampaignNow = factory.activeCampaignByCreator(creator);
        require(activeCampaignNow == campaign, "ACTIVE_CAMPAIGN_NOT_UPDATED");

        vm.stopBroadcast();

        console2.log("FactoryProxy:", factoryProxy);
        console2.log("Owner:", currentOwner);
        console2.log("Creator:", creator);
        console2.log("activeCampaignByCreator now:", activeCampaignNow);
    }
}
