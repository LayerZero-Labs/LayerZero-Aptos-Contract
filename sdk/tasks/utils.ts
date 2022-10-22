import { CHAIN_STAGE, ChainKey, ChainStage } from "@layerzerolabs/core-sdk"
import { getAccount, KeyType } from "../src/utils"
import * as aptos from "aptos"
import invariant from "tiny-invariant"
import * as util from "util"
import * as child_process from "child_process"
import * as fs from "fs"
import * as path from "path"

const INCLUDE_ARTIFACTS = "none" //none,sparse,all

export const ZRO_MODULES = ["zro.mv"]

export const LAYERZERO_COMMON_MODULES = ["acl.mv", "utils.mv", "serde.mv", "packet.mv", "semver.mv"]

export const MSGLIB_AUTH_MODULES = ["msglib_cap.mv"]
export const MSGLIB_V1_1_MODUELS = ["msglib_v1_1.mv", "msglib_v1_1_router.mv"]
export const MSGLIB_V2_MODUELS = ["msglib_v2_router.mv"]

export const EXECUTOR_AUTH_MODULES = ["executor_cap.mv"]
export const EXECUTOR_V2_MODULES = ["executor_v2.mv"]

export const LAYERZERO_MODULES = [
    "admin.mv",
    "bulletin.mv",
    "channel.mv",
    "uln_signer.mv",
    "uln_config.mv",
    "packet_event.mv",
    "msglib_v1_0.mv",
    "msglib_router.mv",
    "msglib_config.mv",
    "executor_v1.mv",
    "executor_router.mv",
    "executor_config.mv",
    "endpoint.mv",
    "lzapp.mv",
    "remote.mv",
    "oft.mv",
    "uln_receive.mv",
]

export const COUNTER_MODULES = ["counter.mv"]

export const BRIDGE_MODULES = ["asset.mv", "limiter.mv", "coin_bridge.mv"]

export const ORACLE_MODULES = ["oracle.mv"]

function getNetworkForStage(stage: ChainStage) {
    const networks: string[] = []
    for (const keyType in ChainKey) {
        const key = ChainKey[keyType as keyof typeof ChainKey]
        if (CHAIN_STAGE[key] === stage) {
            networks.push(key)
        }
    }
    return networks
}

export function validateStageOfNetworks(stage: ChainStage, toNetworks: string[]) {
    const networks = getNetworkForStage(stage)
    toNetworks.forEach((network) => {
        if (!networks.includes(network)) {
            throw new Error(`Invalid network: ${network} for stage: ${stage}`)
        }
    })
}

export function getAccountFromFile(file: string) {
    return getAccount(file, KeyType.JSON_FILE)
}

export function getAccountFromFileFromMnemonic(file: string) {
    return getAccount(file, KeyType.MNEMONIC)
}

export function semanticVersion(version: string): { major: aptos.BCS.Uint64; minor: aptos.BCS.Uint8 } {
    const v = version.split(".")
    invariant(v.length === 2, "Invalid version format")
    return {
        major: BigInt(v[0]),
        minor: Number(v[1]),
    }
}

export async function getDeployedModules(client: aptos.AptosClient, address: aptos.HexString): Promise<string[]> {
    const modules = await client.getAccountModules(address)
    return modules
        .map((m) => {
            return m.abi
        })
        .filter((m) => m !== undefined)
        .map((m) => {
            return m!.name
        })
}

export async function initialDeploy(
    client: aptos.AptosClient,
    address: aptos.HexString,
    moduleNames: string[],
): Promise<boolean> {
    const checkModules = moduleNames.map((m) => m.replace(".mv", ""))
    const accountModules = await getDeployedModules(client, address)
    const modules = accountModules.filter((m) => checkModules.includes(m))
    return modules.length === 0
}

export async function compilePackage(
    packagePath: string,
    buildPath: string,
    namedAddresses: { [key: string]: string },
) {
    const addresses = Object.keys(namedAddresses)
        .map((key) => `${key}=${namedAddresses[key]}`)
        .join(",")
    const command = `aptos move compile --included-artifacts ${INCLUDE_ARTIFACTS} --save-metadata --package-dir ${packagePath} --output-dir ${buildPath} --named-addresses ${addresses}`
    console.log(`command: ${command}`)
    const execPromise = util.promisify(child_process.exec)
    return execPromise(command)
}

export function getMetadataAndModules(
    buildPath: string,
    moduleNames: string[],
): { metadata: Uint8Array; modules: aptos.TxnBuilderTypes.Module[] } {
    const dirName = buildPath.split("/").pop().replace(new RegExp("-", "g"), "_")
    const metadataPath = path.join(buildPath, `build/${dirName}/package-metadata.bcs`)
    const modulePath = path.join(buildPath, `build/${dirName}/bytecode_modules`)
    const metadata = Uint8Array.from(fs.readFileSync(metadataPath))
    const modules = moduleNames.map(
        (f) => new aptos.TxnBuilderTypes.Module(Uint8Array.from(fs.readFileSync(path.join(modulePath, f)))),
    )
    return { metadata, modules }
}

export function arrayToCsv(columns, data) {
    return columns
        .join(",")
        .concat("\n")
        .concat(
            data
                .map(
                    (row) =>
                        row
                            .map(String) // convert every value to String
                            .map((v) => (v === "undefined" ? "" : v))
                            .map((v) => v.replace(/\"/g, "\"\"")) // escape double colons
                            .map((v) => `"${v}"`) // quote it
                            .join(","), // comma-separated
                )
                .join("\r\n"), // rows starting on new lines)
        )
}
