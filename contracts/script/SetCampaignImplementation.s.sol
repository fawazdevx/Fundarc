// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {FundarcCampaign} from "../src/FundarcCampaign.sol";
import {FundarcFactory} from "../src/FundarcFactory.sol";

contract SetCampaignImplementation is Script {
    function run() external {
        address factoryProxy = vm.envAddress("FACTORY_PROXY");

        vm.startBroadcast();

        FundarcFactory factory = FundarcFactory(factoryProxy);
        address sender = msg.sender;
        address currentOwner = factory.owner();
        require(currentOwner == sender, "SENDER_NOT_FACTORY_OWNER");

        FundarcCampaign campaignImpl = new FundarcCampaign();
        factory.setCampaignImplementation(address(campaignImpl));

        address implementationNow = factory.campaignImplementation();
        require(implementationNow == address(campaignImpl), "CAMPAIGN_IMPL_NOT_UPDATED");

        vm.stopBroadcast();

        console2.log("FactoryProxy:", factoryProxy);
        console2.log("Owner:", currentOwner);
        console2.log("CampaignImplementation:", address(campaignImpl));
    }
}
