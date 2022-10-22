#!/usr/bin/env -S npx ts-node
import * as commander from "commander"
import { CHAIN_ID } from "@layerzerolabs/core-sdk"
import { wireAll } from "./wireAll"
import { LzConfig, NETWORK_NAME } from "./config"
import {
    deployBridge,
    deployCommon,
    deployCounter,
    deployExecutorV2,
    deployLayerzero,
    deployMsglibV1_1,
    deployMsglibV2,
    deployOracle,
    deployZro,
} from "./deploy"
import * as path from "path"
import { getAccountFromFile, validateStageOfNetworks } from "./utils"
import * as options from "./options"

const program = new commander.Command()
program.name("aptos-manager").version("0.0.1").description("aptos deploy and config manager")

program
    .command("wireAll")
    .description("wire all")
    .addOption(options.OPTION_PROMPT)
    .addOption(options.OPTION_TO_NETWORKS)
    .addOption(options.OPTION_ENV)
    .addOption(options.OPTION_STAGE)
    .addOption(options.OPTION_KEY_PATH)
    .addOption(options.OPTION_FORKED)
    .action(async (options) => {
        const toNetworks = options.toNetworks
        validateStageOfNetworks(options.stage, toNetworks)
        const network = NETWORK_NAME[options.stage]
        const lookupIds = toNetworks.map((network) => CHAIN_ID[network.replace("-fork", "")])
        const lzConfig = LzConfig(options.stage, lookupIds, options.forked)

        const basePath = path.join(options.keyPath, `stage_${options.stage}`)
        const accounts = {
            layerzero: getAccountFromFile(path.join(basePath, "layerzero.json")),
            relayer: getAccountFromFile(path.join(basePath, "relayer.json")),
            executor: getAccountFromFile(path.join(basePath, "executor.json")),
            oracle: getAccountFromFile(path.join(basePath, "oracle.json")),
            bridge: getAccountFromFile(path.join(basePath, "bridge.json")),
        }

        await wireAll(options.stage, options.env, network, toNetworks, options.prompt, accounts, lzConfig)
    })

const deploy = program
    .command("deploy")
    .description("deploy")
    .addOption(options.OPTION_ENV)
    .addOption(options.OPTION_STAGE)
    .addOption(options.OPTION_KEY_PATH)
deploy.command("layerzero").action(async (_, command) => {
    const options = command.optsWithGlobals()
    const endpointId = CHAIN_ID[NETWORK_NAME[options.stage]]
    const account = getAccountFromFile(path.join(options.keyPath, `stage_${options.stage}`, "layerzero.json"))

    await deployZro(options.env, account)
    await deployCommon(options.env, account)
    await deployMsglibV1_1(options.env, account)
    await deployMsglibV2(options.env, account)
    await deployExecutorV2(options.env, account)
    await deployLayerzero(options.env, endpointId, account)
})
deploy.command("oracle").action(async (_, command) => {
    const options = command.optsWithGlobals()
    const account = getAccountFromFile(path.join(options.keyPath, `stage_${options.stage}`, "oracle.json"))
    await deployOracle(options.env, options.stage, account)
})
deploy.command("bridge").action(async (_, command) => {
    const options = command.optsWithGlobals()
    const account = getAccountFromFile(path.join(options.keyPath, `stage_${options.stage}`, "bridge.json"))
    await deployBridge(options.env, options.stage, account)
})
deploy.command("counter").action(async (_, command) => {
    const options = command.optsWithGlobals()
    const account = getAccountFromFile(path.join(options.keyPath, `stage_${options.stage}`, "counter.json"))
    await deployCounter(options.env, options.stage, account)
})

program.parse()
