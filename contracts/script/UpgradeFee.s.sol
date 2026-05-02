// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {FundarcCampaign} from "../src/FundarcCampaign.sol";
import {FundarcFactory} from "../src/FundarcFactory.sol";

contract UpgradeFee is Script {
    function run() external {
        address factoryProxy = vm.envAddress("FACTORY_PROXY");

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
            abi.encodeWithSignature(
                "upgradeToAndCall(address,bytes)",
                address(newFactoryImpl),
                bytes("")
            )
        );
        require(ok1, _getRevertMsg(ret1));

        // 3) Point factory to new campaign impl
        (bool ok2, bytes memory ret2) = factoryProxy.call(
            abi.encodeWithSignature(
                "setCampaignImplementation(address)",
                address(newCampaignImpl)
            )
        );
        require(ok2, _getRevertMsg(ret2));

        // 4) Post-check: confirm it updated
        address implNow = FundarcFactory(factoryProxy).campaignImplementation();
        require(implNow == address(newCampaignImpl), "CAMPAIGN_IMPL_NOT_UPDATED");

        vm.stopBroadcast();

        console2.log("campaignImplementation now:", implNow);
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