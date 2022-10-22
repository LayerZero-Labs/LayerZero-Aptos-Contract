import { ConfigType } from "./config"
import { CHAIN_ID, ChainStage } from "@layerzerolabs/core-sdk"
import { FAUCET_URL, NODE_URL } from "../src/constants"
import * as aptos from "aptos"
import { Oracle } from "../src/modules/apps/oracle"
import { Coin } from "../src/modules/apps/coin"
import { Bridge, PacketType } from "../src/modules/apps/bridge"
import * as utils from "../src/utils"
import { isErrorOfApiError } from "../src/utils"
import { cli } from "cli-ux"
import { arrayToCsv, semanticVersion } from "./utils"
import { SDK } from "../src"
import { Environment } from "../src/types"
import invariant from "tiny-invariant"

const fs = require("fs").promises

export async function wireAll(
    _stage: ChainStage,
    _env: Environment,
    _network: string,
    _toNetworks: string[],
    prompt: boolean,
    accounts: { [key: string]: aptos.AptosAccount },
    CONFIG: ConfigType,
) {
    const endpointId = CHAIN_ID[_network]
    console.log({
        stage: ChainStage[_stage],
        env: _env,
        network: _network,
        endpointId: endpointId,
        toNetworks: _toNetworks,
    })
    const sdk = new SDK({
        provider: new aptos.AptosClient(NODE_URL[_env]),
        stage: _stage,
    })

    if (_env === Environment.LOCAL) {
        const faucet = new aptos.FaucetClient(NODE_URL[_env], FAUCET_URL[_env])
        for (const accountName in accounts) {
            const address = accounts[accountName].address()
            await faucet.fundAccount(address, 1000000000)
        }
        for (const val in CONFIG.oracle.validators) {
            await faucet.fundAccount(val, 1000000000)
        }
        await faucet.fundAccount(CONFIG.relayer.signerAddress, 1000000000)
        await faucet.fundAccount(CONFIG.executor.address, 1000000000)
    }

    //check if all required accounts exist
    for (const accountName in accounts) {
        const address = accounts[accountName].address()
        try {
            await sdk.client.getAccount(address)
        } catch (e) {
            if (isErrorOfApiError(e, 404)) {
                console.log(`Account ${accountName}(${address}) not exists`)
                return
            }
            throw e
        }
    }

    const lzTxns: Transaction[] = []
    const relayerTxns: Transaction[] = []
    const oracleTxns: Transaction[] = await configureOracle(sdk, endpointId, CONFIG)
    const bridgeTxns: Transaction[] = await configureBridge(sdk, endpointId, CONFIG)
    const executorTxns: Transaction[] = []

    for (const remoteNetwork of _toNetworks) {
        const [lookupId, remoteId] = getEndpointId(remoteNetwork)
        lzTxns.push(...(await configureLayerzeroWithRemote(sdk, endpointId, lookupId, remoteId, CONFIG)))
        relayerTxns.push(...(await configureRelayerWithRemote(sdk, endpointId, lookupId, remoteId, CONFIG)))
        executorTxns.push(...(await configureExecutorWithRemote(sdk, endpointId, lookupId, remoteId, CONFIG)))
        oracleTxns.push(...(await configureOracleWithRemote(sdk, endpointId, lookupId, remoteId, CONFIG)))
        bridgeTxns.push(...(await configureBridgeWithRemote(sdk, endpointId, lookupId, remoteId, CONFIG)))
    }

    const transactionByModule = [
        {
            accountName: "layerzero",
            account: accounts.layerzero,
            txns: lzTxns,
        },
        {
            accountName: "relayer",
            account: accounts.relayer,
            txns: relayerTxns,
        },
        {
            accountName: "executor",
            account: accounts.executor,
            txns: executorTxns,
        },
        {
            accountName: "oracle",
            account: accounts.oracle,
            txns: oracleTxns,
        },
        {
            accountName: "bridge",
            account: accounts.bridge,
            txns: bridgeTxns,
        },
    ]

    let needChange = false
    transactionByModule.forEach(({ accountName, txns }) => {
        console.log(`************************************************`)
        console.log(`Transaction for ${accountName}`)
        console.log(`************************************************`)
        const txnNeedChange = txns.filter((tx) => tx.needChange)
        if (!txnNeedChange.length) {
            console.log("No change needed")
        } else {
            needChange = true
            console.table(txnNeedChange)
        }
    })

    const columns = ["needChange", "chainId", "remoteChainId", "module", "function", "args", "diff", "payload"]
    const data = transactionByModule.reduce((acc, { accountName, txns }) => {
        txns.forEach((transaction) => {
            acc.push([
                accountName,
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
    await fs.writeFile("./transactions.csv", arrayToCsv(["accountName"].concat(columns), data))

    console.log(`Full configuration written to: ${process.cwd()}/transactions.csv`)
    if (!needChange) {
        return
    }

    await promptToProceed("Would you like to proceed with above instruction?", prompt)

    const errs: any[] = []
    const print: any = {}
    let previousPrintLine = 0
    const printResult = () => {
        if (previousPrintLine) {
            process.stdout.moveCursor(0, -previousPrintLine)
        }
        if (Object.keys(print)) {
            previousPrintLine = Object.keys(print).length + 4
            console.table(Object.keys(print).map((account) => ({ account, ...print[account] })))
        }
    }
    await Promise.all(
        transactionByModule.map(async ({ accountName, account, txns }) => {
            const txnsToSend = txns.filter((tx) => tx.needChange)
            let successTx = 0
            print[accountName] = print[accountName] || { requests: `${successTx}/${txnsToSend.length}` }
            for (const txn of txnsToSend) {
                print[accountName].current = `${txn.module}.${txn.function}`
                printResult()
                try {
                    const tx = await sdk.sendAndConfirmTransaction(account, txn.payload)
                    print[accountName].past = tx.hash
                    successTx++
                    print[accountName].requests = `${successTx}/${txnsToSend.length}`
                    printResult()
                } catch (e) {
                    console.log(`Failing calling ${txn.module}::${txn.function} for ${accountName} with err ${e}`)
                    console.log(e)
                    errs.push({
                        accountName,
                        e,
                    })
                    print[accountName].current = e
                    print[accountName].err = true
                    printResult()
                    break
                }
            }
        }),
    )
    if (!errs.length) {
        console.log("Wired all accounts successfully")
    } else {
        console.log(errs)
    }
}

function getEndpointId(remoteNetwork: string): [number, number] {
    const lookupId = CHAIN_ID[remoteNetwork]
    const remoteId = lookupId + 100
    return [lookupId, remoteId]
}

export async function configureBridge(sdk: SDK, endpointId: number, config): Promise<Transaction[]> {
    const transactions: Transaction[] = []
    const coinModule = new Coin(sdk, config.bridge.address)
    const bridgeModule = new Bridge(sdk, coinModule, config.bridge.address)
    transactions.push(...(await enableCustomAdapterParams(bridgeModule, endpointId, config.bridge)))
    for (const coin in config.bridge.coins) {
        transactions.push(...(await registerCoin(bridgeModule, endpointId, coin, config.bridge.coins[coin])))
        transactions.push(...(await setLimiter(bridgeModule, endpointId, coin, config.bridge.coins[coin])))
    }
    return transactions
}

export async function configureBridgeWithRemote(
    sdk: SDK,
    endpointId: number,
    lookupId: number,
    remoteId: number,
    config: ConfigType,
): Promise<Transaction[]> {
    const transactions: Transaction[] = []
    const coinModule = new Coin(sdk, config.bridge.address)
    const bridgeModule = new Bridge(sdk, coinModule, config.bridge.address)
    transactions.push(...(await setRemoteBridge(bridgeModule, endpointId, lookupId, remoteId, config.bridge)))
    transactions.push(...(await setMinDstGas(bridgeModule, endpointId, lookupId, remoteId, config.bridge)))
    for (const coin in config.bridge.coins) {
        transactions.push(
            ...(await setRemoteCoin(bridgeModule, endpointId, lookupId, remoteId, coin, config.bridge.coins[coin])),
        )
    }
    return transactions
}

export async function configureOracle(sdk: SDK, endpointId: number, config: ConfigType): Promise<Transaction[]> {
    const transactions: Transaction[] = []
    const oracleModule = new Oracle(sdk, config.oracle.address)
    transactions.push(...(await setValidatorsForOracle(oracleModule, endpointId, config.oracle)))
    transactions.push(...(await setThresholdForOracle(oracleModule, endpointId, config.oracle)))
    return transactions
}

export async function configureOracleWithRemote(
    sdk: SDK,
    endpointId: number,
    lookupId: number,
    remoteId: number,
    config: ConfigType,
): Promise<Transaction[]> {
    const transactions: Transaction[] = []
    const oracleModule = new Oracle(sdk, config.oracle.address)
    transactions.push(...(await setFeeForOracle(oracleModule, endpointId, lookupId, remoteId, config.oracle)))
    return transactions
}

export async function configureRelayer(sdk: SDK, endpointId: number, config: ConfigType): Promise<Transaction[]> {
    const transactions: Transaction[] = []
    transactions.push(...(await registerRelayer(sdk, endpointId, config.relayer)))
    return transactions
}

export async function configureRelayerWithRemote(
    sdk: SDK,
    endpointId: number,
    lookupId: number,
    remoteId: number,
    config: ConfigType,
): Promise<Transaction[]> {
    const transactions: Transaction[] = []
    transactions.push(...(await setFeeForRelayer(sdk, endpointId, lookupId, remoteId, config.relayer)))
    return transactions
}

export async function configureExecutor(sdk: SDK, endpointId: number, config: ConfigType): Promise<Transaction[]> {
    const transactions: Transaction[] = []
    transactions.push(...(await registerExecutor(sdk, endpointId, config.executor)))
    return transactions
}

export async function configureExecutorWithRemote(
    sdk: SDK,
    endpointId: number,
    lookupId: number,
    remoteId: number,
    config: ConfigType,
): Promise<Transaction[]> {
    const transactions: Transaction[] = []
    transactions.push(...(await setFeeForExecutor(sdk, endpointId, lookupId, remoteId, config.executor)))
    return transactions
}

export async function configureLayerzeroWithRemote(
    sdk: SDK,
    endpointId: number,
    lookupId: number,
    remoteId: number,
    config: ConfigType,
): Promise<Transaction[]> {
    const transactions: Transaction[] = []
    transactions.push(...(await setChainAddressSize(sdk, endpointId, remoteId, config.msglib.msglibv1)))
    transactions.push(...(await setDefaultAppConfig(sdk, endpointId, lookupId, remoteId, config.msglib.msglibv1)))
    transactions.push(...(await setDefaultSendMsgLib(sdk, endpointId, remoteId, config.msglib.msglibv1)))
    transactions.push(...(await setDefaultReceiveMsgLib(sdk, endpointId, remoteId, config.msglib.msglibv1)))
    transactions.push(...(await setDefaultExecutor(sdk, endpointId, remoteId, config.endpoint)))
    transactions.push(...(await setDefaultAdapterParams(sdk, endpointId, lookupId, remoteId, config.endpoint)))
    return transactions
}

async function setChainAddressSize(sdk: SDK, endpointId, remoteId, config) {
    const cur = await sdk.LayerzeroModule.Uln.Config.getChainAddressSize(remoteId)
    const needChange = cur == 0 || cur !== config.addressSize
    const payload = sdk.LayerzeroModule.Uln.Config.setChainAddressSizePayload(remoteId, config.addressSize)
    const tx: Transaction = {
        needChange,
        chainId: endpointId,
        remoteChainId: remoteId,
        module: sdk.LayerzeroModule.Uln.Config.moduleName,
        function: payload.function.split("::")[2],
        args: payload.arguments,
        payload,
    }
    if (tx.needChange) {
        tx.diff = {
            addressSize: {
                oldValue: cur.toString(),
                newValue: config.addressSize.toString(),
            },
        }
    }
    return [tx]
}

async function setDefaultSendMsgLib(sdk: SDK, endpointId, remoteId, config): Promise<Transaction[]> {
    const cur = await sdk.LayerzeroModule.MsgLibConfig.getDefaultSendMsgLib(remoteId)
    const version = semanticVersion(config.defaultReceiveVersion)
    const needChange = cur.major == BigInt(0) || (cur.major !== version.major && cur.minor !== version.minor)
    const payload = sdk.LayerzeroModule.MsgLibConfig.setDefaultSendMsgLibPayload(remoteId, version.major, version.minor)
    const tx: Transaction = {
        needChange,
        chainId: endpointId,
        remoteChainId: remoteId,
        module: sdk.LayerzeroModule.Endpoint.moduleName,
        function: payload.function.split("::")[2],
        args: payload.arguments,
        payload,
    }
    if (tx.needChange) {
        tx.diff = {
            defaultSendMsgLib: {
                oldValue: cur.toString(),
                newValue: config.defaultSendVersion.toString(),
            },
        }
    }
    return [tx]
}

async function setDefaultReceiveMsgLib(sdk: SDK, endpointId, remoteId, config): Promise<Transaction[]> {
    const cur = await sdk.LayerzeroModule.MsgLibConfig.getDefaultReceiveMsgLib(remoteId)
    const version = semanticVersion(config.defaultReceiveVersion)
    const needChange = cur.major == BigInt(0) || (cur.major !== version.major && cur.minor !== version.minor)
    const payload = sdk.LayerzeroModule.MsgLibConfig.setDefaultReceiveMsgLibPayload(
        remoteId,
        version.major,
        version.minor,
    )
    const tx: Transaction = {
        needChange,
        chainId: endpointId,
        remoteChainId: remoteId,
        module: sdk.LayerzeroModule.Endpoint.moduleName,
        function: payload.function.split("::")[2],
        args: payload.arguments,
        payload: payload,
    }
    if (tx.needChange) {
        tx.diff = {
            defaultReceiveMsgLib: {
                oldValue: cur.toString(),
                newValue: config.defaultReceiveVersion.toString(),
            },
        }
    }
    return [tx]
}

async function setDefaultExecutor(sdk: SDK, endpointId, remoteId, config): Promise<Transaction[]> {
    const [cur_executor, cur_version] = await sdk.LayerzeroModule.ExecutorConfig.getDefaultExecutor(remoteId)
    const needChange =
        cur_executor !== config.defaultExecutor.address ||
        cur_version.toString() !== config.defaultExecutor.version.toString()
    const payload = sdk.LayerzeroModule.ExecutorConfig.setDefaultExecutorPayload(
        remoteId,
        config.defaultExecutor.version,
        config.defaultExecutor.address,
    )
    const tx: Transaction = {
        needChange,
        chainId: endpointId,
        remoteChainId: remoteId,
        module: sdk.LayerzeroModule.Endpoint.moduleName,
        function: payload.function.split("::")[2],
        args: payload.arguments,
        payload,
    }
    if (tx.needChange) {
        tx.diff = {
            defaultReceiveMsgLib: {
                oldValue: {
                    version: cur_version.toString(),
                    address: cur_executor.toString(),
                },
                newValue: config.defaultExecutor.toString(),
            },
        }
    }
    return [tx]
}

async function setDefaultAppConfig(sdk: SDK, endpointId, lookupId, remoteId, config): Promise<Transaction[]> {
    const cur = await sdk.LayerzeroModule.Uln.Config.getDefaultAppConfig(remoteId)
    const defaultAppConfig = config.defaultAppConfig[lookupId]
    console.log(`cur.oracle: ${cur.oracle}`)
    const needChange =
        aptos.HexString.ensure(cur.oracle).noPrefix() !== aptos.HexString.ensure(defaultAppConfig.oracle).noPrefix() ||
        aptos.HexString.ensure(cur.relayer).noPrefix() !==
        aptos.HexString.ensure(defaultAppConfig.relayer).noPrefix() ||
        cur.inbound_confirmations.toString() !== defaultAppConfig.inboundConfirmations.toString() ||
        cur.outbound_confirmations.toString() !== defaultAppConfig.outboundConfirmations.toString()
    console.log(`defaultAppConfig.oracle:${defaultAppConfig.oracle}`)
    const payload = sdk.LayerzeroModule.Uln.Config.setDefaultAppConfigPayload(remoteId, {
        oracle: defaultAppConfig.oracle,
        relayer: defaultAppConfig.relayer,
        inbound_confirmations: defaultAppConfig.inboundConfirmations.toString(),
        outbound_confirmations: defaultAppConfig.outboundConfirmations.toString(),
    })
    const tx: Transaction = {
        needChange,
        chainId: endpointId,
        remoteChainId: remoteId,
        module: sdk.LayerzeroModule.Uln.Config.moduleName,
        function: payload.function.split("::")[2],
        args: payload.arguments,
        payload,
    }
    if (tx.needChange) {
        tx.diff = {
            defaultAppConfig: {
                oldValue: toObject(cur),
                newValue: toObject(defaultAppConfig),
            },
        }
    }
    return [tx]
}

async function setDefaultAdapterParams(sdk: SDK, endpointId, lookupId, remoteId, config): Promise<Transaction[]> {
    const cur = await sdk.LayerzeroModule.Executor.getDefaultAdapterParams(remoteId)
    const [, curUaGas, ] = sdk.LayerzeroModule.Executor.decodeAdapterParams(cur)
    const defaultAdapterParam = config.defaultAdapterParam[lookupId]
    const needChange = curUaGas.toString() !== defaultAdapterParam.uaGas.toString()

    const adapterParams = sdk.LayerzeroModule.Executor.buildDefaultAdapterParams(defaultAdapterParam.uaGas)
    const payload = sdk.LayerzeroModule.Executor.setDefaultAdapterParamsPayload(remoteId, adapterParams)
    const tx: Transaction = {
        needChange,
        chainId: endpointId,
        remoteChainId: remoteId,
        module: sdk.LayerzeroModule.Executor.moduleName,
        function: payload.function.split("::")[2],
        args: payload.arguments,
        payload,
    }
    if (tx.needChange) {
        tx.diff = {
            uaGas: {
                oldValue: curUaGas.toString(),
                newValue: defaultAdapterParam.uaGas.toString(),
            },
        }
    }
    return [tx]
}

async function registerExecutor(sdk: SDK, endpointId, config): Promise<Transaction[]> {
    invariant(config.address !== "", "Executor address is empty")
    const registered = await sdk.LayerzeroModule.Executor.isRegistered(config.address)
    const needChange = !registered

    const payload = sdk.LayerzeroModule.Executor.registerPayload()
    const tx: Transaction = {
        needChange,
        chainId: endpointId,
        module: sdk.LayerzeroModule.Executor.moduleName,
        function: payload.function.split("::")[2],
        args: payload.arguments,
        payload,
    }
    if (tx.needChange) {
        tx.diff = {
            registered: {
                oldValue: false,
                newValue: true,
            },
        }
    }
    return [tx]
}

async function setFeeForExecutor(sdk: SDK, endpointId, lookupId, remoteId, config): Promise<Transaction[]> {
    invariant(config.address !== "", "Executor address is empty")
    const cur = await sdk.LayerzeroModule.Executor.getFee(config.address, remoteId)
    const fee = config.fee[lookupId]
    const needChange =
        cur.airdropAmtCap.toString() !== fee.airdropAmtCap.toString() ||
        cur.priceRatio == BigInt(0) ||
        cur.gasPrice == BigInt(0)

    const payload = sdk.LayerzeroModule.Executor.setFeePayload(remoteId, fee)
    const tx: Transaction = {
        needChange,
        chainId: endpointId,
        remoteChainId: remoteId,
        module: sdk.LayerzeroModule.Executor.moduleName,
        function: payload.function.split("::")[2],
        args: payload.arguments,
        payload,
    }
    if (tx.needChange) {
        tx.diff = {
            fee: {
                oldValue: toObject(cur),
                newValue: toObject(fee),
            },
        }
    }
    return [tx]
}

async function registerRelayer(sdk: SDK, endpointId, config): Promise<Transaction[]> {
    invariant(config.signerAddress !== "", "signerAddress is empty")
    const registered = await sdk.LayerzeroModule.Uln.Signer.isRegistered(config.signerAddress)
    const needChange = !registered

    const payload = sdk.LayerzeroModule.Uln.Signer.registerPayload()
    const tx: Transaction = {
        needChange,
        chainId: endpointId,
        module: sdk.LayerzeroModule.Uln.Signer.moduleName,
        function: payload.function.split("::")[2],
        args: payload.arguments,
        payload,
    }
    if (tx.needChange) {
        tx.diff = {
            registered: {
                oldValue: false,
                newValue: true,
            },
        }
    }
    return [tx]
}

async function setFeeForRelayer(sdk: SDK, endpointId, lookupId, remoteId, config): Promise<Transaction[]> {
    invariant(config.signerAddress !== "", "signerAddress is empty")
    const cur = await sdk.LayerzeroModule.Uln.Signer.getFee(config.signerAddress, remoteId)
    const fee = config.fee[lookupId]
    const needChange = cur.base_fee !== BigInt(fee.baseFee) || cur.fee_per_byte !== BigInt(fee.feePerByte)

    const payload = sdk.LayerzeroModule.Uln.Signer.setFeePayload(remoteId, fee.baseFee, fee.feePerByte)
    const tx: Transaction = {
        needChange,
        chainId: endpointId,
        module: sdk.LayerzeroModule.Uln.Signer.moduleName,
        remoteChainId: remoteId,
        function: payload.function.split("::")[2],
        args: payload.arguments,
        payload,
    }
    if (tx.needChange) {
        tx.diff = {
            fee: {
                oldValue: toObject(cur),
                newValue: toObject(fee),
            },
        }
    }
    return [tx]
}

async function setValidatorsForOracle(oracleSdk: Oracle, endpointId, config): Promise<Transaction[]> {
    let txns: Transaction[] = []
    for (const v in config.validators) {
        const cur = await oracleSdk.isValidator(v)
        const newState = config.validators[v]
        const needChange = cur !== newState
        const payload = oracleSdk.setValidatorPayload(v, newState)
        const tx: Transaction = {
            needChange,
            chainId: endpointId,
            module: oracleSdk.moduleName,
            function: payload.function.split("::")[2],
            args: payload.arguments,
            payload,
        }
        if (tx.needChange) {
            tx.diff = {
                validator: {
                    oldValue: {
                        [v]: cur,
                    },
                    newValue: {
                        [v]: newState,
                    },
                },
            }
        }
        txns.push(tx)
    }
    return txns
}

async function setThresholdForOracle(oracleSdk: Oracle, endpointId, config): Promise<Transaction[]> {
    const cur = await oracleSdk.getThreshold()
    const needChange = cur.toString() !== config.threshold.toString()

    const payload = oracleSdk.setThresholdPayload(config.threshold)
    const tx: Transaction = {
        needChange,
        chainId: endpointId,
        module: oracleSdk.moduleName,
        function: payload.function.split("::")[2],
        args: payload.arguments,
        payload,
    }
    if (tx.needChange) {
        tx.diff = {
            threshold: {
                oldValue: cur.toString(),
                newValue: config.threshold.toString(),
            },
        }
    }
    return [tx]
}

async function setFeeForOracle(oracleSdk: Oracle, endpointId, lookupId, remoteId, config): Promise<Transaction[]> {
    invariant(config.signerAddress !== "", "signerAddress is empty")
    const cur = await oracleSdk.sdk.LayerzeroModule.Uln.Signer.getFee(config.signerAddress, remoteId)
    const fee = config.fee[lookupId]
    const needChange = cur.base_fee !== BigInt(fee.baseFee)

    const payload = oracleSdk.setFeePayload(remoteId, fee.baseFee)
    const tx: Transaction = {
        needChange,
        chainId: endpointId,
        module: oracleSdk.moduleName,
        remoteChainId: remoteId,
        function: payload.function.split("::")[2],
        args: payload.arguments,
        payload,
    }
    if (tx.needChange) {
        tx.diff = {
            base_fee: {
                oldValue: cur.base_fee.toString(),
                newValue: fee.baseFee.toString(),
            },
        }
    }
    return [tx]
}

async function setMinDstGas(bridgeSdk: Bridge, endpointId, lookupId, remoteId, config): Promise<Transaction[]> {
    const cur = await bridgeSdk.getMinDstGas(remoteId, BigInt(PacketType.SEND))
    const minDstGas = config.minDstGas[PacketType.SEND][lookupId]
    const needChange = cur.toString() !== minDstGas.toString()
    const payload = bridgeSdk.setMinDstGasPayload(remoteId, BigInt(PacketType.SEND), minDstGas)
    const tx: Transaction = {
        needChange,
        chainId: endpointId,
        remoteChainId: remoteId,
        module: bridgeSdk.moduleName,
        function: payload.function.split("::")[2],
        args: payload.arguments,
        payload,
    }
    if (tx.needChange) {
        tx.diff = {
            gas: {
                oldValue: cur.toString(),
                newValue: minDstGas.toString(),
            },
        }
    }
    return [tx]
}

async function enableCustomAdapterParams(bridgeSdk: Bridge, endpointId, config): Promise<Transaction[]> {
    const enabled = await bridgeSdk.customAdapterParamsEnabled()
    const needChange = enabled !== config.enableCustomAdapterParams

    const payload = bridgeSdk.enableCustomAdapterParamsPayload(config.enableCustomAdapterParams)
    const tx: Transaction = {
        needChange,
        chainId: endpointId,
        module: bridgeSdk.moduleName,
        function: payload.function.split("::")[2],
        args: payload.arguments,
        payload,
    }
    if (tx.needChange) {
        tx.diff = {
            enabled: {
                oldValue: enabled,
                newValue: config.enableCustomAdapterParams,
            },
        }
    }
    return [tx]
}

async function setRemoteBridge(bridgeSdk: Bridge, endpointId, lookupId, remoteId, config): Promise<Transaction[]> {
    const curBuffer = await bridgeSdk.getRemoteBridge(remoteId)
    const cur = "0x" + Buffer.from(curBuffer).toString("hex")
    const remoteBridge = config.remoteBridge[lookupId]
    const needChange = cur.toLowerCase() !== remoteBridge.address.toLowerCase()

    const payload = bridgeSdk.setRemoteBridgePayload(
        remoteId,
        utils.convertToPaddedUint8Array(remoteBridge.address, remoteBridge.addressSize),
    )
    const tx: Transaction = {
        needChange,
        chainId: endpointId,
        remoteChainId: remoteId,
        module: bridgeSdk.moduleName,
        function: payload.function.split("::")[2],
        args: payload.arguments,
        payload,
    }
    if (tx.needChange) {
        tx.diff = {
            remote: {
                oldValue: cur,
                newValue: remoteBridge.address,
            },
        }
    }
    return [tx]
}

async function registerCoin(bridgeSdk: Bridge, endpointId, coin, config): Promise<Transaction[]> {
    const cur = await bridgeSdk.hasCoinRegistered(coin)
    const needChange = !cur

    const payload = bridgeSdk.registerCoinPayload(
        coin,
        config.name,
        config.symbol,
        config.decimals,
        config.limiter.capSD,
    )
    const tx: Transaction = {
        needChange,
        chainId: endpointId,
        module: bridgeSdk.moduleName,
        function: payload.function.split("::")[2],
        args: payload.arguments,
        payload,
    }
    if (tx.needChange) {
        tx.diff = {
            registered: {
                oldValue: false,
                newValue: true,
            },
        }
    }
    return [tx]
}

async function setLimiter(bridgeSdk: Bridge, endpointId, coin, config): Promise<Transaction[]> {
    const cur = await bridgeSdk.getLimitCap(coin)
    const needChange =
        cur.enabled.toString() !== config.limiter.enabled.toString() ||
        cur.capSD.toString() !== config.limiter.capSD.toString() ||
        cur.windowSec.toString() !== config.limiter.windowSec.toString()

    const payload = bridgeSdk.setLimiterCapPayload(
        coin,
        config.limiter.enabled,
        config.limiter.capSD,
        config.limiter.windowSec,
    )
    const tx: Transaction = {
        needChange,
        chainId: endpointId,
        module: bridgeSdk.moduleName,
        function: payload.function.split("::")[2],
        args: payload.arguments,
        payload,
    }
    if (tx.needChange) {
        tx.diff = {
            set: {
                oldValue: toObject(cur),
                newValue: toObject(config),
            },
        }
    }
    return [tx]
}

async function setRemoteCoin(bridgeSdk: Bridge, endpointId, lookupId, remoteId, coin, config): Promise<Transaction[]> {
    const cur = await bridgeSdk.hasRemoteCoin(coin, remoteId)
    const needChange = !cur
    const remoteCoin = config.remotes[lookupId]
    if (!remoteCoin) {
        return []
    }

    const payload = bridgeSdk.setRemoteCoinPayload(coin, remoteId, remoteCoin.address, remoteCoin.unwrappable)
    const tx: Transaction = {
        needChange,
        chainId: endpointId,
        remoteChainId: remoteId,
        module: bridgeSdk.moduleName,
        function: payload.function.split("::")[2],
        args: payload.arguments,
        payload,
    }
    if (tx.needChange) {
        tx.diff = {
            set: {
                oldValue: false,
                newValue: true,
            },
        }
    }
    return [tx]
}

function toObject(obj) {
    return JSON.parse(
        JSON.stringify(
            obj,
            (key, value) => (typeof value === "bigint" ? value.toString() : value), // return everything else unchanged
        ),
    )
}

export interface Transaction {
    needChange: boolean
    chainId: string
    remoteChainId?: string
    module: string
    function: string
    args: string[]
    payload: aptos.Types.EntryFunctionPayload
    diff?: { [key: string]: { newValue: any; oldValue: any } }
}

async function promptToProceed(msg: string, prompt: boolean = true) {
    if (prompt) {
        const proceed = await cli.prompt(`${msg} y/N`)
        if (!["y", "yes"].includes(proceed.toLowerCase())) {
            console.log("Aborting...")
            process.exit(0)
        }
    }
}
