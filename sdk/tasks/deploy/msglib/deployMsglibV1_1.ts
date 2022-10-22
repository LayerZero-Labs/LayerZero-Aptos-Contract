import { Environment } from "../../../src/types"
import * as aptos from "aptos"
import { FAUCET_URL, NODE_URL } from "../../../src/constants"
import * as layerzero from "../../../src"
import * as path from "path"
import { compilePackage, getMetadataAndModules, MSGLIB_V1_1_MODUELS } from "../../utils"

export async function deployMsglibV1_1(env: Environment, account: aptos.AptosAccount) {
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

    // compile and deploy msglib v1.1
    const packagePath = path.join(__dirname, "../../../../msglib/msglib-v1/msglib-v1-1")
    await compilePackage(packagePath, packagePath, {
        layerzero_common: address,
        msglib_auth: address,
        msglib_v1_1: address,
        zro: address,
    })
    const { metadata, modules } = getMetadataAndModules(packagePath, MSGLIB_V1_1_MODUELS)
    await sdk.deploy(account, metadata, modules)

    console.log("Deployed msg lib v1.1!!")
}
