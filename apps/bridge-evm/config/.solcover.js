module.exports = {
    skipFiles: [
        "interfaces/ILayerZeroEndpoint.sol",
        "interfaces/ILayerZeroReceiver.sol",
        "interfaces/ILayerZeroUserApplicationConfig.sol",
        "lzApp/LzApp.sol",
        "lzApp/NonblockingLzApp.sol",
        "mocks/LZEndpointMock.sol",
    ],
    configureYulOptimizer: true,
    solcOptimizerDetails: {
        yul: true,
        yulDetails: {
            stackAllocation: true,
        },
    },
}
