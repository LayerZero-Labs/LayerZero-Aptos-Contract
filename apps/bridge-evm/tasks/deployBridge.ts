import * as crossChainHelper from "./utils/crossChainHelper"
import { promises as fs } from "fs"
import * as util from "util"
import * as child_process from "child_process"

module.exports = async function (taskArgs, hre) {
    const networks = taskArgs.networks.split(",")

    const command = "npx hardhat compile"
    const execPromise = util.promisify(child_process.exec)
    await execPromise(command)

    if (taskArgs.deleteOldDeploy) {
        await Promise.all(
            networks.map(async (network) => {
                const file = `./deployments/${network}/TokenBridge.json`
                try {
                    await fs.rm(file)
                } catch {
                    console.log(`No file to delete: ${file}`)
                }
            })
        )
    }

    await Promise.all(
        networks.map(async (network) => {
            await crossChainHelper.deployContract(hre, network, ["TokenBridge"])
        })
    )
}
