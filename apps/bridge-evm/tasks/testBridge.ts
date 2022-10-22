import * as crossChainHelper from "./utils/crossChainHelper"

const SRC_NETWORKS = ["ethereum-fork"]

module.exports = async function (taskArgs, hre) {
    // contracts already deployed
    crossChainHelper.setForking(true, ["TokenBridge"])

    await hre.run("deployBridge", {
        networks: SRC_NETWORKS.join(","),
        deleteOldDeploy: true,
    })

    await hre.run("wireAllSubtask", {
        e: "mainnet",
        srcNetworks: SRC_NETWORKS.map((n) => n.replace("-fork", "")).join(","),
        noPrompt: true,
    })
}
