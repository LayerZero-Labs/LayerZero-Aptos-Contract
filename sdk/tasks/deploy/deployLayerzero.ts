import { FAUCET_URL, NODE_URL } from "../../src/constants"
import * as aptos from "aptos"
import * as layerzero from "../../src"
import * as path from "path"
import { compilePackage, getMetadataAndModules, initialDeploy, LAYERZERO_MODULES } from "../utils"
import { Environment } from "../../src/types"

export async function deployLayerzero(env: Environment, endpointId: number, account: aptos.AptosAccount) {
    const layerzeroAddress = account.address().toString()
    console.log({
        env,
        endpointId,
        layerzeroAddress,
    })

    if (env === Environment.LOCAL) {
        const faucet = new aptos.FaucetClient(NODE_URL[env], FAUCET_URL[env])
        await faucet.fundAccount(layerzeroAddress, 1000000000)
    }

    const sdk = new layerzero.SDK({
        provider: new aptos.AptosClient(NODE_URL[env]),
        accounts: {
            layerzero: layerzeroAddress,
            msglib_auth: layerzeroAddress,
            msglib_v1_1: layerzeroAddress,
            msglib_v2: layerzeroAddress,
            zro: layerzeroAddress,
            executor_auth: layerzeroAddress,
            executor_v2: layerzeroAddress,
        },
    })

    // compile and deploy layerzero
    const packagePath = path.join(__dirname, "../../../layerzero")
    await compilePackage(packagePath, packagePath, {
        layerzero: layerzeroAddress,
        layerzero_common: layerzeroAddress,
        msglib_auth: layerzeroAddress,
        executor_auth: layerzeroAddress,
        zro: layerzeroAddress,
        msglib_v1_1: layerzeroAddress,
        msglib_v2: layerzeroAddress,
        executor_v2: layerzeroAddress,
    })
    const initial = await initialDeploy(sdk.client, account.address(), LAYERZERO_MODULES)
    const { metadata, modules } = getMetadataAndModules(packagePath, LAYERZERO_MODULES)
    await sdk.deploy(account, metadata, modules)

    if (initial) {
        console.log("Initial deploy: configuring MsglibAuth")
        await sdk.LayerzeroModule.Endpoint.initialize(account, endpointId)
        await sdk.LayerzeroModule.Endpoint.registerExecutor(account, sdk.LayerzeroModule.Executor.type)
        await sdk.LayerzeroModule.Uln.Receive.initialize(account)
    }

    console.log("Deployed Layerzero!!")
}
