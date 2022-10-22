import { FAUCET_URL, NODE_URL } from "../../src/constants"
import * as aptos from "aptos"
import * as layerzero from "../../src"
import * as path from "path"
import { compilePackage, COUNTER_MODULES, getMetadataAndModules } from "../utils"
import { Environment } from "../../src/types"
import { ChainStage } from "@layerzerolabs/core-sdk"

export async function deployCounter(
    env: Environment,
    stage: ChainStage,
    account: aptos.AptosAccount,
    layerzeroAddress: string = undefined,
) {
    const counterAddress = account.address().toString()
    console.log({
        env,
        stage,
        counterAddress,
    })

    if (env === Environment.LOCAL) {
        const faucet = new aptos.FaucetClient(NODE_URL[env], FAUCET_URL[env])
        await faucet.fundAccount(counterAddress, 1000000000)
    }

    const sdk = new layerzero.SDK({
        provider: new aptos.AptosClient(NODE_URL[env]),
        stage,
    })

    // compile and deploy bridge
    const packagePath = path.join(__dirname, "../../../apps/counter")
    await compilePackage(packagePath, packagePath, {
        layerzero: layerzeroAddress ?? sdk.accounts.layerzero.toString(),
        layerzero_common: layerzeroAddress ?? sdk.accounts.layerzero.toString(),
        msglib_auth: layerzeroAddress ?? sdk.accounts.layerzero.toString(),
        zro: layerzeroAddress ?? sdk.accounts.layerzero.toString(),
        msglib_v1_1: layerzeroAddress ?? sdk.accounts.layerzero.toString(),
        msglib_v2: layerzeroAddress ?? sdk.accounts.layerzero.toString(),
        executor_auth: layerzeroAddress ?? sdk.accounts.layerzero.toString(),
        executor_v2: layerzeroAddress ?? sdk.accounts.layerzero.toString(),
        counter: counterAddress,
    })

    const { metadata, modules } = getMetadataAndModules(packagePath, COUNTER_MODULES)
    await sdk.deploy(account, metadata, modules)

    console.log("Deployed Counter!!")
}
