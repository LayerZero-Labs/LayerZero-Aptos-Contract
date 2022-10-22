import * as crossChainHelper from "./utils/crossChainHelper"
import { Transaction } from "./utils/crossChainHelper"
import { arrayToCsv, validateStageOfNetworks } from "../../../sdk/tasks/utils"
import { CHAIN_STAGE, ChainStage } from "@layerzerolabs/core-sdk"
import { BRIDGE_ADDRESS as APTOS_BRIDGE_ADDRESS } from "../../../sdk/src/constants"
import { ethers } from "ethers"
import { TOKEN_ADDRESSES } from "./config/addresses"
import { CoinType } from "../../../sdk/src/modules/apps/coin"
import invariant from "tiny-invariant"
import { getConfig } from "./config"
import { PacketType, ULNV2_CONFIG_TYPE_LOOKUP } from "./config/types"

const Web3 = require("web3")
const web3 = new Web3()

const fs = require("fs").promises

const CHAIN_ID_BIAS = 100 //todo: remove 100 when id is good

module.exports = async function (taskArgs, hre) {
    if (crossChainHelper.FORKING) {
        console.log(`Running in fork mode, with ${crossChainHelper.CONTRACT_ON_FORK} on fork`)
    }

    const signers = await hre.ethers.getSigners()
    console.log(`CURRENT SIGNER: ${signers[0].address}`)
    const srcNetworks = taskArgs.srcNetworks.split(",")
    const env = taskArgs.e

    let stage = ChainStage.TESTNET_SANDBOX
    let dstNetwork = "aptos-testnet-sandbox"
    if (env === "mainnet") {
        dstNetwork = "aptos"
        stage = ChainStage.MAINNET
    } else if (env === "testnet") {
        dstNetwork = "aptos-testnet"
        stage = ChainStage.TESTNET
    }

    validateStageOfNetworks(stage, srcNetworks)

    const CONFIG = getConfig(stage)
    console.log(env, stage)
    console.log(CONFIG)

    // prompt for continuation
    await crossChainHelper.promptToProceed(
        `do you want to wire these srcNetworks: ${srcNetworks} and dstNetwork: ${dstNetwork}?`,
        taskArgs.noPrompt
    )

    console.log(`************************************************`)
    console.log(`Computing diff`)
    console.log(`************************************************`)

    let transactionBynetwork = await Promise.all(
        srcNetworks.map(async (network) => {
            const transactions: crossChainHelper.Transaction[] = []

            transactions.push(...(await configureCoins(hre, network, CONFIG.coins)))
            transactions.push(...(await setBridgeFeeBP(hre, network, CONFIG.feeBP)))
            transactions.push(...(await setUseCustomAdapterParams(hre, network, CONFIG.useCustomAdapterParams)))
            transactions.push(...(await setTrustedRemote(hre, network, dstNetwork)))
            transactions.push(...(await setMinDstGas(hre, network, dstNetwork, CONFIG.minDstGas)))
            // transactions.push(...(await setAppConfig(hre, network, dstNetwork, CONFIG.appConfig)))
            return {
                network,
                transactions,
            }
        })
    )

    const noChanges = transactionBynetwork.reduce((acc, { transactions }) => {
        acc += transactions.filter((transaction) => transaction.needChange).length
        return acc
    }, 0)
    if (noChanges == 0) {
        //early return
        console.log("No changes needed")
        return
    }

    transactionBynetwork.forEach(({ network, transactions }) => {
        console.log(`************************************************`)
        console.log(`Transaction for ${network}`)
        console.log(`************************************************`)
        const transactionNeedingChange = transactions.filter((transaction) => transaction.needChange)
        if (!transactionNeedingChange.length) {
            console.log("No change needed")
        } else {
            console.table(transactionNeedingChange)
        }
    })

    const columns = ["needChange", "chainId", "remoteChainId", "contractName", "methodName", "args", "diff", "calldata"]

    const data = transactionBynetwork.reduce((acc, { network, transactions }) => {
        transactions.forEach((transaction) => {
            acc.push([
                network,
                ...columns.map((key) => {
                    if (typeof transaction[key] === "object") {
                        return JSON.stringify(transaction[key])
                    } else {
                        return transaction[key]
                    }
                }),
            ])
        })
        return acc
    }, [])
    await fs.writeFile("./transactions.csv", arrayToCsv(["network"].concat(columns), data))

    console.log("Full configuration is written at:")
    console.log(`file:/${process.cwd()}/transactions.csv`)

    await crossChainHelper.promptToProceed("Would you like to proceed with above instruction?", taskArgs.noPrompt)

    const errs: any[] = []
    const print: any = {}
    let previousPrintLine = 0
    const printResult = () => {
        if (previousPrintLine) {
            process.stdout.moveCursor(0, -previousPrintLine)
        }
        if (Object.keys(print)) {
            previousPrintLine = Object.keys(print).length + 4
            console.table(Object.keys(print).map((network) => ({ network, ...print[network] })))
        }
    }

    await Promise.all(
        transactionBynetwork.map(async ({ network, transactions }) => {
            const transactionToCommit = transactions.filter((transaction) => transaction.needChange)

            let successTx = 0
            print[network] = print[network] || { requests: `${successTx}/${transactionToCommit.length}` }
            for (let transaction of transactionToCommit) {
                print[network].current = `${transaction.contractName}.${transaction.methodName}`
                printResult()
                try {
                    const tx = await crossChainHelper.executeTransaction(hre, network, transaction)
                    print[network].past = `${transaction.contractName}.${transaction.methodName} (${tx.transactionHash})`
                    successTx++
                    print[network].requests = `${successTx}/${transactionToCommit.length}`
                    printResult()
                } catch (err: any) {
                    console.log(`Failing calling ${transaction.contractName}.${transaction.methodName} for network ${network} with err ${err}`)
                    console.log(err)
                    errs.push({
                        network,
                        err,
                    })
                    print[network].current = err
                    print[network].err = true
                    printResult()
                    break
                }
            }
        })
    )

    if (!errs.length) {
        console.log("Wired all networks successfully")
    } else {
        console.log(errs)
    }
}

async function setUseCustomAdapterParams(hre: any, network: string, useCustom: boolean): Promise<Transaction[]> {
    const contractName = "TokenBridge"
    const bridge = await crossChainHelper.getContract(hre, network, contractName)
    const cur = await bridge.useCustomAdapterParams()
    const needChange = cur !== useCustom

    const tx: any = {
        needChange,
        chainId: crossChainHelper.getEndpointId(network),
        contractName,
        methodName: "setUseCustomAdapterParams",
        args: [useCustom],
        calldata: "",
    }
    if (tx.needChange) {
        tx.diff = { useCustomAdapterParams: { oldValue: cur, newValue: useCustom } }
    }
    return [tx]
}

async function setAppConfig(hre: any, network: string, aptosNetwork: string, config): Promise<Transaction[]> {
    const contractName = "TokenBridge"
    const chainId = crossChainHelper.getEndpointId(network)
    const remoteChainId = crossChainHelper.getEndpointId(aptosNetwork)
    const lookupId = chainId - CHAIN_ID_BIAS

    const appConfig = config[lookupId]

    const bridge = await crossChainHelper.getContract(hre, network, contractName)
    const endpointAddress = await bridge.lzEndpoint()
    const endpoint = new ethers.Contract(
        endpointAddress,
        new ethers.utils.Interface(["function defaultSendVersion() public view returns (uint16)"])
    ).connect(bridge.provider)
    const sendVersion = await endpoint.defaultSendVersion()

    const txns: Transaction[] = []
    for (const configType in appConfig) {
        const args = [sendVersion, remoteChainId, ethers.constants.AddressZero, configType]
        const cur = await bridge.getConfig(...args)
        const newValue = web3.eth.abi.encodeParameter(ULNV2_CONFIG_TYPE_LOOKUP[configType], appConfig[configType])

        const needChange = cur !== newValue
        const tx: any = {
            needChange,
            chainId,
            contractName,
            methodName: "setConfig",
            args: args,
            calldata: "",
        }
        if (tx.needChange) {
            tx.diff = { appConfig: { oldValue: cur, newValue: newValue } }
        }
        txns.push(tx)
    }

    return txns
}

async function setBridgeFeeBP(hre: any, network: string, fee): Promise<Transaction[]> {
    const contractName = "TokenBridge"
    const bridge = await crossChainHelper.getContract(hre, network, contractName)
    const cur = await bridge.bridgeFeeBP()
    const needChange = cur.toString() !== fee.toString()

    const tx: any = {
        needChange,
        chainId: crossChainHelper.getEndpointId(network),
        contractName,
        methodName: "setBridgeFeeBP",
        args: [fee],
        calldata: "",
    }
    if (tx.needChange) {
        tx.diff = { bridgeFeeBP: { oldValue: cur, newValue: fee } }
    }
    return [tx]
}

async function setMinDstGas(hre: any, network: string, aptosNetwork: string, config): Promise<Transaction[]> {
    const contractName = "TokenBridge"
    const newGas = config[PacketType.SEND_TO_APTOS]
    const bridge = await crossChainHelper.getContract(hre, network, contractName)
    const remoteChainId = crossChainHelper.getEndpointId(aptosNetwork)
    const cur = await bridge.minDstGasLookup(remoteChainId, PacketType.SEND_TO_APTOS)
    const needChange = cur.toString() !== newGas.toString()

    const tx: any = {
        needChange,
        chainId: crossChainHelper.getEndpointId(network),
        contractName,
        methodName: "setMinDstGas",
        args: [remoteChainId, PacketType.SEND_TO_APTOS, newGas],
        calldata: "",
    }
    if (tx.needChange) {
        tx.diff = { minDstGas: { oldValue: cur, newValue: newGas } }
    }
    return [tx]
}

async function setTrustedRemote(hre: any, network: string, aptosNetwork: string): Promise<Transaction[]> {
    const contractName = "TokenBridge"
    const bridge = await crossChainHelper.getContract(hre, network, contractName)

    const chainStage = CHAIN_STAGE[aptosNetwork]
    const desiredTrustedRemote = ethers.utils.solidityPack(["address", "address"], [APTOS_BRIDGE_ADDRESS[chainStage], bridge.address])

    const remoteChainId = crossChainHelper.getEndpointId(aptosNetwork)
    const cur = await bridge.isTrustedRemote(remoteChainId, desiredTrustedRemote)
    const needChange = !cur

    const tx: any = {
        needChange,
        chainId: crossChainHelper.getEndpointId(network),
        contractName,
        methodName: "setTrustedRemote",
        args: [remoteChainId, desiredTrustedRemote],
        calldata: "",
    }
    if (tx.needChange) {
        tx.diff = { trustedRemote: { oldValue: "0x", newValue: desiredTrustedRemote } }
    }
    return [tx]
}

async function configureCoins(hre: any, network: string, config: any): Promise<Transaction[]> {
    const contractName = "TokenBridge"
    const chainId = crossChainHelper.getEndpointId(network)
    const lookupId = chainId - CHAIN_ID_BIAS
    const coins = config[lookupId]

    let txns: Transaction[] = []
    const bridge = await crossChainHelper.getContract(hre, network, contractName)
    for (const coinType of coins) {
        const coinAddress = TOKEN_ADDRESSES[coinType][lookupId]
        invariant(coinAddress, `Missing coin address for ${coinType} in TOKEN_ADDRESSES`)

        if (coinType === CoinType.WETH) {
            const cur = await bridge.weth()
            const needChange = cur === ethers.constants.AddressZero

            const tx: any = {
                needChange,
                chainId: crossChainHelper.getEndpointId(network),
                contractName,
                methodName: "setWETH",
                args: [coinAddress],
                calldata: "",
            }
            if (tx.needChange) {
                tx.diff = { [coinType]: { oldValue: "0x", newValue: coinAddress } }
            }
            txns.push(tx)
        }

        const supported = await bridge.supportedTokens(coinAddress)
        const needChange = !supported
        const tx: any = {
            needChange,
            chainId: crossChainHelper.getEndpointId(network),
            contractName,
            methodName: "registerToken",
            args: [coinAddress],
            calldata: "",
        }
        if (tx.needChange) {
            tx.diff = { [coinType]: { oldValue: "0x", newValue: coinAddress } }
        }
        txns.push(tx)
    }
    return txns
}
