// SPDX-License-Identifier: MIT

// contracts/script/Deploy.s.sol

pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {FundarcCampaign} from "../src/FundarcCampaign.sol";
import {FundarcFactory} from "../src/FundarcFactory.sol";
import {ERC1967Proxy} from "openzeppelin-contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract Deploy is Script {
    function run() external {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address owner = vm.envAddress("OWNER");

        uint16 feeBps = uint16(vm.envUint("FEE_BPS")); // e.g. 100 = 1%
        address feeTreasury = vm.envAddress("FEE_TREASURY");

        vm.startBroadcast();

        FundarcCampaign campaignImpl = new FundarcCampaign();
        FundarcFactory factoryImpl = new FundarcFactory();

        bytes memory initData =
            abi.encodeCall(FundarcFactory.initialize, (owner, usdc, address(campaignImpl), feeBps, feeTreasury));

        ERC1967Proxy proxy = new ERC1967Proxy(address(factoryImpl), initData);

        vm.stopBroadcast();

        console2.log("CampaignImplementation:", address(campaignImpl));
        console2.log("FactoryProxy:", address(proxy));
        console2.log("FactoryImplementation:", address(factoryImpl));
    }
}
