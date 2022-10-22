import { FAUCET_URL, NODE_URL } from "../../src/constants"
import * as aptos from "aptos"
import * as layerzero from "../../src"
import * as path from "path"
import { compilePackage, getMetadataAndModules, ZRO_MODULES } from "../utils"
import { Environment } from "../../src/types"

export async function deployZro(env: Environment, account: aptos.AptosAccount) {
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

    // compile and deploy zro
    const packagePath = path.join(__dirname, "../../../zro")
    await compilePackage(packagePath, packagePath, { zro: address })
    const { metadata, modules } = getMetadataAndModules(packagePath, ZRO_MODULES)
    await sdk.deploy(account, metadata, modules)

    console.log("Deployed ZRO!!")
}
