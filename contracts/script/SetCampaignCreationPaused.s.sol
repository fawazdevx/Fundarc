// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {FundarcFactory} from "../src/FundarcFactory.sol";

contract SetCampaignCreationPaused is Script {
    function run() external {
        address factoryProxy = vm.envAddress("FACTORY_PROXY");
        bool paused = vm.envBool("CAMPAIGN_CREATION_PAUSED");

        vm.startBroadcast();

        FundarcFactory factory = FundarcFactory(factoryProxy);
        address sender = msg.sender;
        address currentOwner = factory.owner();
        require(currentOwner == sender, "SENDER_NOT_FACTORY_OWNER");

        factory.setCampaignCreationPaused(paused);

        bool pausedNow = factory.campaignCreationPaused();
        require(pausedNow == paused, "CREATION_PAUSE_NOT_UPDATED");

        vm.stopBroadcast();

        console2.log("FactoryProxy:", factoryProxy);
        console2.log("Owner:", currentOwner);
        console2.log("campaignCreationPaused now:", pausedNow);
    }
}
