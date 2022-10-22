import { FAUCET_URL, NODE_URL } from "../../src/constants"
import * as aptos from "aptos"
import * as layerzero from "../../src"
import * as path from "path"
import {
    compilePackage,
    EXECUTOR_AUTH_MODULES,
    getMetadataAndModules,
    initialDeploy,
    LAYERZERO_COMMON_MODULES,
    MSGLIB_AUTH_MODULES,
} from "../utils"
import { Environment } from "../../src/types"

export async function deployCommon(env: Environment, account: aptos.AptosAccount) {
    const layerzeroAddress = account.address().toString()
    console.log({
        env,
        address: layerzeroAddress,
    })

    if (env === Environment.LOCAL) {
        const faucet = new aptos.FaucetClient(NODE_URL[env], FAUCET_URL[env])
        await faucet.fundAccount(layerzeroAddress, 1000000000)
    }

    const sdk = new layerzero.SDK({
        provider: new aptos.AptosClient(NODE_URL[env]),
        accounts: {
            msglib_auth: layerzeroAddress,
        },
    })

    // compile and deploy layerzero common
    {
        const packagePath = path.join(__dirname, "../../../layerzero-common")
        await compilePackage(packagePath, packagePath, {
            layerzero_common: layerzeroAddress,
        })
        const { metadata, modules } = getMetadataAndModules(packagePath, LAYERZERO_COMMON_MODULES)
        await sdk.deploy(account, metadata, modules)
        console.log("Deployed Layerzero Common!!")
    }

    // compile and deploy msglib auth
    {
        const packagePath = path.join(__dirname, "../../../msglib/msglib-auth")
        await compilePackage(packagePath, packagePath, {
            layerzero_common: layerzeroAddress,
            msglib_auth: layerzeroAddress,
        })
        const initial = await initialDeploy(sdk.client, account.address(), MSGLIB_AUTH_MODULES)
        const { metadata, modules } = getMetadataAndModules(packagePath, MSGLIB_AUTH_MODULES)
        await sdk.deploy(account, metadata, modules)

        if (initial) {
            console.log("Initial deploy: configuring MsglibAuth")
            await sdk.LayerzeroModule.MsgLibAuth.allow(account, layerzeroAddress)
        }

        console.log("Deployed Msglib Auth!!")
    }

    // compile and deploy executor auth
    {
        const packagePath = path.join(__dirname, "../../../executor/executor-auth")
        await compilePackage(packagePath, packagePath, {
            layerzero_common: layerzeroAddress,
            executor_auth: layerzeroAddress,
        })
        const { metadata, modules } = getMetadataAndModules(packagePath, EXECUTOR_AUTH_MODULES)
        await sdk.deploy(account, metadata, modules)
        console.log("Deployed Executor Auth!!")
    }
}
