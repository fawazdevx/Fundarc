// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {FundarcFactory} from "../src/FundarcFactory.sol";

contract UpgradeFactoryFeeEvent is Script {
    function run() external {
        address factoryProxy = vm.envAddress("FACTORY_PROXY");

        vm.startBroadcast();

        // Pre-check: ensure sender is proxy owner (UUPS authorize uses onlyOwner)
        address sender = msg.sender;
        address currentOwner = FundarcFactory(factoryProxy).owner();
        require(currentOwner == sender, "SENDER_NOT_FACTORY_OWNER");

        console2.log("FactoryProxy:", factoryProxy);
        console2.log("Owner:", currentOwner);

        // 1) Deploy new factory implementation (with FeeTaken event)
        FundarcFactory newFactoryImpl = new FundarcFactory();
        console2.log("NewFactoryImplementation (deployed):", address(newFactoryImpl));

        // 2) UUPS upgrade (no init)
        (bool ok1, bytes memory ret1) = factoryProxy.call(
            abi.encodeWithSignature("upgradeToAndCall(address,bytes)", address(newFactoryImpl), bytes(""))
        );
        require(ok1, _getRevertMsg(ret1));

        vm.stopBroadcast();

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
