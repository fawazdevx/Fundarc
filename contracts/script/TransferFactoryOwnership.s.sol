// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {FundarcFactory} from "../src/FundarcFactory.sol";

contract TransferFactoryOwnership is Script {
    function run() external {
        address factoryProxy = vm.envAddress("FACTORY_PROXY");
        address newOwner = vm.envAddress("NEW_FACTORY_OWNER");

        require(newOwner != address(0), "BAD_NEW_OWNER");

        vm.startBroadcast();

        address sender = msg.sender;
        address currentOwner = FundarcFactory(factoryProxy).owner();

        require(currentOwner == sender, "SENDER_NOT_FACTORY_OWNER");
        require(newOwner != currentOwner, "OWNER_UNCHANGED");

        console2.log("FactoryProxy:", factoryProxy);
        console2.log("Current owner:", currentOwner);
        console2.log("New owner:", newOwner);

        FundarcFactory(factoryProxy).transferOwnership(newOwner);

        address ownerNow = FundarcFactory(factoryProxy).owner();
        require(ownerNow == newOwner, "OWNER_TRANSFER_FAILED");

        vm.stopBroadcast();

        console2.log("Factory ownership transferred.");
        console2.log("Owner now:", ownerNow);
    }
}
