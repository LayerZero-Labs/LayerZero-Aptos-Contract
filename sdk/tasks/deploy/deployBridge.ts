import * as aptos from "aptos"
import * as layerzero from "../../src"
import * as path from "path"
import { BRIDGE_MODULES, compilePackage, getMetadataAndModules } from "../utils"
import { FAUCET_URL, NODE_URL } from "../../src/constants"
import { Environment } from "../../src/types"
import { ChainStage } from "@layerzerolabs/core-sdk"

export async function deployBridge(
    env: Environment,
    stage: ChainStage,
    account: aptos.AptosAccount,
    layerzeroAddress: string = undefined,
) {
    const bridgeAddress = account.address().toString()
    console.log({
        env,
        stage,
        bridgeAddress,
    })

    if (env === Environment.LOCAL) {
        const faucet = new aptos.FaucetClient(NODE_URL[env], FAUCET_URL[env])
        await faucet.fundAccount(bridgeAddress, 1000000000)
    }

    const sdk = new layerzero.SDK({
        provider: new aptos.AptosClient(NODE_URL[env]),
        stage,
    })

    // compile and deploy bridge
    const packagePath = path.join(__dirname, "../../../apps/bridge")
    await compilePackage(packagePath, packagePath, {
        layerzero: layerzeroAddress ?? sdk.accounts.layerzero.toString(),
        layerzero_common: layerzeroAddress ?? sdk.accounts.layerzero.toString(),
        msglib_auth: layerzeroAddress ?? sdk.accounts.msglib_auth.toString(),
        zro: layerzeroAddress ?? sdk.accounts.zro.toString(),
        msglib_v1_1: layerzeroAddress ?? sdk.accounts.msglib_v1_1.toString(),
        msglib_v2: layerzeroAddress ?? sdk.accounts.msglib_v2.toString(),
        executor_auth: layerzeroAddress ?? sdk.accounts.executor_auth.toString(),
        executor_v2: layerzeroAddress ?? sdk.accounts.executor_v2.toString(),
        bridge: bridgeAddress,
    })

    const { metadata, modules } = getMetadataAndModules(packagePath, BRIDGE_MODULES)
    await sdk.deploy(account, metadata, modules)

    console.log("Deployed Bridge!!")
}
