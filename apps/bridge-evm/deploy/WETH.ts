import { CHAIN_STAGE, ChainStage } from "@layerzerolabs/core-sdk"

module.exports = async function ({ deployments, getNamedAccounts, network }) {
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    const name = network.name.replace("-fork", "")
    if (CHAIN_STAGE[name] !== ChainStage.TESTNET || network.name.includes("fork")) {
        throw new Error("Only supported on testnet / fork")
    }

    console.log(`deployer: ${deployer}`)

    await deploy("WETH", {
        from: deployer,
        args: [],
        log: true,
        waitConfirmations: 1,
        skipIfAlreadyDeployed: true,
    })
}

module.exports.tags = ["WETH"]
