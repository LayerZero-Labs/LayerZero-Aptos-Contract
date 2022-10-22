import { CHAIN_STAGE, ChainStage } from "@layerzerolabs/core-sdk"

module.exports = async function ({ deployments, getNamedAccounts, network }) {
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    console.log(`Network: ${network.name}`)

    const name = network.name.replace("-fork", "")
    if (CHAIN_STAGE[name] !== ChainStage.TESTNET || network.name.includes("fork")) {
        throw new Error("Only supported on testnet / fork")
    }

    await deploy("Token", {
        from: deployer,
        args: ["USDC", "USDC", 6],
        log: true,
        waitConfirmations: 1,
        skipIfAlreadyDeployed: true,
    })
}

module.exports.tags = ["Token"]
