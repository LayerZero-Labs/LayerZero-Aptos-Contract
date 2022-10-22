// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.15;

import "../../contracts/TokenBridge.sol";
import "../../contracts/mocks/LZEndpointMock.sol";

// the proxy to make internal functions public for testing
contract TokenBridgeProxy is TokenBridge {
    constructor(
        address _layerZeroEndpoint,
        uint16 _localChainId,
        uint16 _aptosChainId
    ) TokenBridge(_layerZeroEndpoint, _localChainId, _aptosChainId) {}

    function encodeSendPayload(
        address _token,
        bytes32 _toAddress,
        uint64 _amountSD
    ) external pure returns (bytes memory) {
        return _encodeSendPayload(_token, _toAddress, _amountSD);
    }

    function decodeReceivePayload(bytes calldata _payload)
        external
        pure
        returns (
            address token,
            address to,
            uint64 amountSD,
            bool unwrap
        )
    {
        return _decodeReceivePayload(_payload);
    }

    function SDtoLD(address _token, uint64 _amountSD) external view returns (uint) {
        return _SDtoLD(_token, _amountSD);
    }

    function LDtoSD(address _token, uint _amountLD) external view returns (uint64) {
        return _LDtoSD(_token, _amountLD);
    }
}
