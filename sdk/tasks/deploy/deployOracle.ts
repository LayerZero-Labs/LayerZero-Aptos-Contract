import { FAUCET_URL, NODE_URL } from "../../src/constants"
import * as aptos from "aptos"
import * as layerzero from "../../src"
import * as path from "path"
import * as fs from "fs"
import { Oracle } from "../../src/modules/apps/oracle"
import { compilePackage, ORACLE_MODULES } from "../utils"
import { Environment } from "../../src/types"
import { ChainStage } from "@layerzerolabs/core-sdk"

export async function deployOracle(
    env: Environment,
    stage: ChainStage,
    account: aptos.AptosAccount,
    layerzeroAddress: string = undefined,
) {
    const oracleAddress = account.address().toString()
    console.log({
        env,
        stage,
        oracleAddress,
    })

    if (env === Environment.LOCAL) {
        const faucet = new aptos.FaucetClient(NODE_URL[env], FAUCET_URL[env])
        await faucet.fundAccount(oracleAddress, 1000000000)
    }
    console.log(`oracle account: ${oracleAddress}`)

    const sdk = new layerzero.SDK({
        provider: new aptos.AptosClient(NODE_URL[env]),
        stage: stage,
    })

    // compile and deploy bridge
    const packagePath = path.join(__dirname, "../../../apps/oracle")
    const buildPath = path.join(__dirname, "../../../apps/oracle")
    const metadataPath = path.join(buildPath, "build/oracle/package-metadata.bcs")
    const modulePath = path.join(buildPath, "build/oracle/bytecode_modules")

    await compilePackage(packagePath, buildPath, {
        layerzero: layerzeroAddress ?? sdk.accounts.layerzero.toString(),
        layerzero_common: layerzeroAddress ?? sdk.accounts.layerzero.toString(),
        msglib_auth: layerzeroAddress ?? sdk.accounts.msglib_auth.toString(),
        zro: layerzeroAddress ?? sdk.accounts.zro.toString(),
        msglib_v1_1: layerzeroAddress ?? sdk.accounts.msglib_v1_1.toString(),
        msglib_v2: layerzeroAddress ?? sdk.accounts.msglib_v2.toString(),
        executor_auth: layerzeroAddress ?? sdk.accounts.executor_auth.toString(),
        executor_v2: layerzeroAddress ?? sdk.accounts.executor_v2.toString(),
        oracle: oracleAddress,
    })

    const metadata = Uint8Array.from(fs.readFileSync(metadataPath))
    const modules = ORACLE_MODULES.map(
        (f) => new aptos.TxnBuilderTypes.Module(Uint8Array.from(fs.readFileSync(path.join(modulePath, f)))),
    )
    await sdk.deploy(account, metadata, modules)

    console.log("Deployed Oracle!!")

    const oracleModule = new Oracle(sdk, oracleAddress)
    const resourceAddress = await oracleModule.getResourceAddress()
    console.log(`Oracle resource address: ${resourceAddress}`)
}
