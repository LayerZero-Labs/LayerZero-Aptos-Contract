import { Environment } from "../../../src/types"
import * as aptos from "aptos"
import { FAUCET_URL, NODE_URL } from "../../../src/constants"
import * as layerzero from "../../../src"
import * as path from "path"
import { compilePackage, EXECUTOR_V2_MODULES, getMetadataAndModules } from "../../utils"

export async function deployExecutorV2(env: Environment, account: aptos.AptosAccount) {
    const address = account.address().toString()
    console.log({
        env,
        address,
    })
    if (env === Environment.LOCAL) {
        const faucet = new aptos.FaucetClient(NODE_URL[env], FAUCET_URL[env])
        await faucet.fundAccount(address, 1000000000)
    }

    const sdk = new layerzero.SDK({
        provider: new aptos.AptosClient(NODE_URL[env]),
    })

    // compile and deploy executor v2
    const packagePath = path.join(__dirname, "../../../../executor/executor-v2")
    await compilePackage(packagePath, packagePath, {
        layerzero_common: address,
        executor_auth: address,
        executor_v2: address,
    })
    const { metadata, modules } = getMetadataAndModules(packagePath, EXECUTOR_V2_MODULES)
    await sdk.deploy(account, metadata, modules)

    console.log("Deployed executor v2!!")
}
