import { ChainId, CHAIN_STAGE, LZ_ADDRESS, ChainStage } from "@layerzerolabs/core-sdk"
import * as crossChainHelper from "../tasks/utils/crossChainHelper"

module.exports = async function ({ ethers, deployments, getNamedAccounts, network }) {
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()
    console.log(deployer)
    if (crossChainHelper.FORKING) {
        const provider = await crossChainHelper.getProvider(network.name)
        await provider.send("hardhat_impersonateAccount", [deployer])
        await provider.send("hardhat_setBalance", [deployer, "0x1000000000000000000000000000000000000000000000000000000000000000"])
    }

    console.log(`Network: ${network.name}`)

    const name = network.name.replace("-fork", "")

    const address = LZ_ADDRESS[name] ?? ethers.constants.AddressZero
    console.log(`Network: ${name}, Endpoint Address: ${address}`)

    let aptosId
    switch (CHAIN_STAGE[name]) {
        case ChainStage.MAINNET:
            aptosId = ChainId.APTOS
            break
        case ChainStage.TESTNET:
            aptosId = ChainId.APTOS_TESTNET
            break
        case ChainStage.TESTNET_SANDBOX:
            aptosId = ChainId.APTOS_TESTNET_SANDBOX
            break
        default:
            throw new Error("Invalid chain stage")
    }
    console.log(`Aptos Id: ${aptosId}`)

    await deploy("TokenBridge", {
        from: deployer,
        args: [address, aptosId],
        log: true,
        waitConfirmations: 1,
        skipIfAlreadyDeployed: true,
    })
}

module.exports.tags = ["TokenBridge"]
