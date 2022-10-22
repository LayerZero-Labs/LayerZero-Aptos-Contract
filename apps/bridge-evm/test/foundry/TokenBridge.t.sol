// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.15;

import "./TokenBridgeProxy.sol";
import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../../contracts/mocks/WETH.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TokenBridgeTest is Test {
    TokenBridgeProxy bridge;
    LZEndpointMock endpoint;

    uint16 localChainId = 1;
    uint16 aptosChainId = 2;

    address weth;
    address remoteBridgeAddress = address(1);
    address payable ALICE = payable(address(10));
    bytes32 remoteReceiver = LzLib.addressToBytes32(ALICE);
    LzLib.CallParams callParams = LzLib.CallParams(payable(ALICE), address(0));

    event Packet(bytes payload);

    function setUp() public {
        endpoint = new LZEndpointMock(localChainId);
        bridge = new TokenBridgeProxy(address(endpoint), localChainId, aptosChainId);

        weth = address(new WETH());
        bytes memory path = abi.encodePacked(remoteBridgeAddress, address(bridge));
        bridge.setTrustedRemote(aptosChainId, path);
        bridge.setWETH(weth);
        bridge.registerToken(weth);
    }

    function testSendETH() public {
        vm.startPrank(ALICE);

        uint amountLD = 10 ether; // 10 ETH
        (uint nativeFee, ) = bridge.quoteForSend(callParams, "");
        vm.deal(ALICE, amountLD + nativeFee);

        uint64 amountSD = bridge.LDtoSD(weth, amountLD);
        bytes memory payload = bridge.encodeSendPayload(weth, remoteReceiver, amountSD);
        bytes memory encodedPayload = abi.encodePacked(
            uint64(1),
            localChainId,
            address(bridge),
            aptosChainId,
            remoteBridgeAddress,
            payload
        );
        vm.expectEmit(false, false, false, true);
        emit Packet(encodedPayload);

        bridge.sendETHToAptos{value: amountLD + nativeFee}(
            remoteReceiver,
            amountLD,
            callParams,
            ""
        );
        uint tvlSD = bridge.tvlSDs(weth);
        assertEq(tvlSD, amountSD);
        assertEq(amountLD, IERC20(weth).balanceOf(address(bridge)));
        assertEq(0, ALICE.balance);
    }

    function testSendToken() public {
        vm.startPrank(ALICE);

        uint amountLD = 10 ether; // 10 ETH
        (uint nativeFee, ) = bridge.quoteForSend(callParams, "");
        vm.deal(ALICE, amountLD + nativeFee);

        // convert ETH to WETH and approve
        IWETH(weth).deposit{value: amountLD}();
        IWETH(weth).approve(address(bridge), amountLD);

        uint64 amountSD = bridge.LDtoSD(weth, amountLD);
        bytes memory payload = bridge.encodeSendPayload(weth, remoteReceiver, amountSD);
        bytes memory encodedPayload = abi.encodePacked(
            uint64(1),
            localChainId,
            address(bridge),
            aptosChainId,
            remoteBridgeAddress,
            payload
        );
        vm.expectEmit(false, false, false, true);
        emit Packet(encodedPayload);

        bridge.sendToAptos{value: nativeFee}(weth, remoteReceiver, amountLD, callParams, "");
        uint tvlSD = bridge.tvlSDs(weth);
        assertEq(tvlSD, amountSD);
        assertEq(amountLD, IERC20(weth).balanceOf(address(bridge)));
        assertEq(0, IERC20(weth).balanceOf(ALICE));
    }

    function testReceiveETH() public {
        vm.startPrank(ALICE);

        // prepare tvl
        uint amountLD = 10 ether; // 10 ETH
        (uint nativeFee, ) = bridge.quoteForSend(callParams, "");
        vm.deal(ALICE, amountLD + nativeFee);
        bridge.sendETHToAptos{value: amountLD + nativeFee}(
            remoteReceiver,
            amountLD,
            callParams,
            ""
        );

        // receive ETH
        uint64 halfAmountSD = bridge.LDtoSD(weth, amountLD / 2);
        bytes memory payload = abi.encodePacked(
            uint8(1),
            LzLib.addressToBytes32(weth),
            LzLib.addressToBytes32(ALICE),
            halfAmountSD,
            true
        );
        // console.logBytes(payload);

        endpoint.receivePayload(
            aptosChainId,
            abi.encodePacked(remoteBridgeAddress, address(bridge)),
            address(bridge),
            1,
            1_000_000,
            payload
        );

        uint tvlSD = bridge.tvlSDs(weth);
        assertEq(tvlSD, halfAmountSD);
        assertEq(ALICE.balance, bridge.SDtoLD(weth, halfAmountSD));
    }

    function testEncodeSendPayload() public {
        address token = address(0x1);
        bytes32 toAddress = LzLib.addressToBytes32(address(0x2));
        uint64 amountSD = 1_000_000_000_000;
        bytes memory payload = bridge.encodeSendPayload(token, toAddress, amountSD);
        bytes
            memory expected = hex"0000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000e8d4a51000";
        assertEq(payload, expected);
    }

    function testDecodeReceivePayload() public {
        // payload got from aptos token bridge
        uint8[74] memory payloadInU8s = [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            16,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            17,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            100,
            1
        ];
        bytes memory payload = new bytes(payloadInU8s.length);
        for (uint i = 0; i < payloadInU8s.length; i++) {
            payload[i] = bytes1(payloadInU8s[i]);
        }

        (address token, address to, uint64 amountSD, bool unwrap) = bridge.decodeReceivePayload(
            payload
        );
        assertEq(token, address(0x10));
        assertEq(to, address(0x11));
        assertEq(amountSD, 100);
        assertEq(unwrap, true);
    }
}
