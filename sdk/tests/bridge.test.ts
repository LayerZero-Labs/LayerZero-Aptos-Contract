import * as aptos from "aptos"
import * as layerzero from "../src"
import { Bridge, PacketType } from "../src/modules/apps/bridge"
import { BridgeCoinType, Coin, CoinType } from "../src/modules/apps/coin"
import { bytesToUint8Array, convertToPaddedUint8Array, encodePacket, fullAddress, hashPacket } from "../src/utils"
import { Environment, Packet } from "../src/types"

import { BN } from "bn.js"
import { hexToBytes } from "@noble/hashes/utils"
import {
    deployBridge,
    deployCommon,
    deployExecutorV2,
    deployLayerzero,
    deployMsglibV1_1,
    deployMsglibV2,
    deployZro,
} from "../tasks/deploy"
import { getTestConfig } from "../tasks/config/local"
import {
    configureBridge,
    configureBridgeWithRemote,
    configureExecutor,
    configureExecutorWithRemote,
    configureLayerzeroWithRemote,
    configureRelayer,
    configureRelayerWithRemote,
    Transaction,
} from "../tasks/wireAll"
import * as _ from "lodash"
import { findSecretKeyWithZeroPrefix } from "./utils"
import { FAUCET_URL, NODE_URL } from "../src/constants"
import { ChainStage } from "@layerzerolabs/core-sdk"

const env = Environment.LOCAL

describe("bridge end-to-end test", () => {
    const layerzeroDeployAccount = new aptos.AptosAccount(findSecretKeyWithZeroPrefix(0))
    const layerzeroDeployedAddress = layerzeroDeployAccount.address().toString()

    //oracle
    const oracleDeployAccount = new aptos.AptosAccount(findSecretKeyWithZeroPrefix(0))
    const oracleDeployedAddress = oracleDeployAccount.address().toString()

    //relayer
    const relayerDeployAccount = new aptos.AptosAccount(findSecretKeyWithZeroPrefix(0))
    const relayerDeployedAddress = relayerDeployAccount.address().toString()

    // executor account
    const executorAccount = new aptos.AptosAccount(findSecretKeyWithZeroPrefix(0))
    const executorAddress = executorAccount.address().toString()

    //bridge
    const bridgeDeployAccount = new aptos.AptosAccount(findSecretKeyWithZeroPrefix(0))
    const bridgeDeployedAddress = bridgeDeployAccount.address().toString()

    //user
    const alice = new aptos.AptosAccount(findSecretKeyWithZeroPrefix(0))
    const aliceAddress = alice.address().toString()
    const bob = new aptos.AptosAccount(findSecretKeyWithZeroPrefix(0))
    const bobAddress = bob.address().toString()

    // faucet
    const faucet = new aptos.FaucetClient(NODE_URL[env], FAUCET_URL[env])
    console.log(`node url: ${NODE_URL[env]}, faucet url: ${FAUCET_URL[env]}`)

    const chainId = 20030
    const remoteChainId = 20031
    const remoteBridgeAddr = fullAddress("0x10").toString()
    const remoteBridgeAddrBytes = fullAddress("0x10").toUint8Array()
    const remoteEthAddr = fullAddress("0x22").toString() // mock Eth token address on remote chain, like ethereum
    const remoteUSDCAddr = fullAddress("0x11").toString() // mock USDC token address on remote chain, like ethereum
    const remoteUSDCAddrBytes = fullAddress("0x11").toUint8Array() // mock USDC token address on remote chain, like ethereum
    const remoteReceiverBytes = fullAddress("0x12").toUint8Array()
    // console.log(`remoteBridgeAddrBytes: ${remoteBridgeAddrBytes.toString()}`)

    const nodeUrl = NODE_URL[env]
    const client = new aptos.AptosClient(nodeUrl)
    const sdk = new layerzero.SDK({
        provider: client,
        accounts: {
            layerzero: layerzeroDeployedAddress,
            msglib_auth: layerzeroDeployedAddress,
            msglib_v1_1: layerzeroDeployedAddress,
            msglib_v2: layerzeroDeployedAddress,
            zro: layerzeroDeployedAddress,
            executor_auth: layerzeroDeployedAddress,
            executor_v2: layerzeroDeployedAddress,
        },
    })

    const coinModule = new Coin(sdk, bridgeDeployedAddress)
    const bridgeModule = new Bridge(sdk, coinModule, bridgeDeployedAddress)
    const bridgePrivateKey = bridgeDeployAccount.toPrivateKeyObject().privateKeyHex
    let CONFIG

    // deploy modules and initialize lz protocol modules
    beforeAll(async () => {
        console.log(
            `layerzero deploy account: ${layerzeroDeployedAddress}, private key: ${
                layerzeroDeployAccount.toPrivateKeyObject().privateKeyHex
            }`,
        )
        console.log(`bridge deploy account: ${bridgeDeployedAddress}, private key: ${bridgePrivateKey}`)
        console.log(`alice account: ${aliceAddress}, private key: ${alice.toPrivateKeyObject().privateKeyHex}`)
        console.log(`bob account: ${bobAddress}, private key: ${bob.toPrivateKeyObject().privateKeyHex}`)
        console.log(
            `relayer account: ${relayerDeployedAddress}, private key: ${
                relayerDeployAccount.toPrivateKeyObject().privateKeyHex
            }`,
        )
        console.log(
            `oracle account: ${oracleDeployedAddress}, private key: ${
                oracleDeployAccount.toPrivateKeyObject().privateKeyHex
            }`,
        )

        // airdrop
        await faucet.fundAccount(oracleDeployedAddress, 1000000000)
        await faucet.fundAccount(relayerDeployedAddress, 1000000000)
        await faucet.fundAccount(executorAddress, 1000000000)
        await faucet.fundAccount(aliceAddress, 1000000000)
        await faucet.fundAccount(bobAddress, 1000000000)

        await deployZro(Environment.LOCAL, layerzeroDeployAccount)
        await deployCommon(Environment.LOCAL, layerzeroDeployAccount)
        await deployMsglibV1_1(Environment.LOCAL, layerzeroDeployAccount)
        await deployMsglibV2(Environment.LOCAL, layerzeroDeployAccount)
        await deployExecutorV2(Environment.LOCAL, layerzeroDeployAccount)
        await deployLayerzero(Environment.LOCAL, chainId, layerzeroDeployAccount)
        await deployBridge(
            Environment.LOCAL,
            ChainStage.PLACEHOLDER_IGNORE,
            bridgeDeployAccount,
            layerzeroDeployedAddress,
        )

        CONFIG = getTestConfig(
            remoteChainId,
            layerzeroDeployedAddress,
            oracleDeployedAddress,
            oracleDeployedAddress,
            relayerDeployedAddress,
            executorAddress,
        )

        const lzTxns: Transaction[] = []
        const relayerTxns: Transaction[] = await configureRelayer(sdk, chainId, CONFIG)
        const executorTxns: Transaction[] = await configureExecutor(sdk, chainId, CONFIG)

        lzTxns.push(...(await configureLayerzeroWithRemote(sdk, chainId, remoteChainId, remoteChainId, CONFIG)))
        relayerTxns.push(...(await configureRelayerWithRemote(sdk, chainId, remoteChainId, remoteChainId, CONFIG)))
        executorTxns.push(...(await configureExecutorWithRemote(sdk, chainId, remoteChainId, remoteChainId, CONFIG))) //use same wallet

        const accounts = [layerzeroDeployAccount, relayerDeployAccount, executorAccount]
        const txns = [lzTxns, relayerTxns, executorTxns]
        await Promise.all(
            accounts.map(async (account, i) => {
                const txn = txns[i]
                for (const tx of txn) {
                    await sdk.sendAndConfirmTransaction(account, tx.payload)
                }
            }),
        )

        await sdk.LayerzeroModule.Uln.Signer.register(oracleDeployAccount)
        await sdk.LayerzeroModule.Uln.Signer.setFee(oracleDeployAccount, remoteChainId, 10, 0)
    })

    test("assert bridge registered", async () => {
        const typeinfo = await sdk.LayerzeroModule.Endpoint.getUATypeInfo(bridgeDeployedAddress)
        expect(typeinfo.account_address).toEqual(bridgeDeployedAddress)
    })

    test("config bridge", async () => {
        const config = _.merge(CONFIG, {
            bridge: {
                address: bridgeDeployedAddress,
                remoteBridge: {
                    [remoteChainId]: {
                        address: remoteBridgeAddr,
                        addressSize: 32,
                    },
                },
                minDstGas: {
                    [PacketType.SEND]: {
                        [remoteChainId]: 100000,
                    },
                },
                coins: {
                    [CoinType.WETH]: {
                        remotes: {
                            [remoteChainId]: {
                                address: remoteEthAddr,
                                unwrappable: true,
                            },
                        },
                    },
                    [CoinType.USDC]: {
                        remotes: {
                            [remoteChainId]: {
                                address: remoteUSDCAddr,
                                unwrappable: false,
                            },
                        },
                    },
                },
            },
        })
        const bridgeTxns: Transaction[] = await configureBridge(sdk, chainId, config)
        bridgeTxns.push(...(await configureBridgeWithRemote(sdk, chainId, remoteChainId, remoteChainId, config)))
        for (const txn of bridgeTxns) {
            await sdk.sendAndConfirmTransaction(bridgeDeployAccount, txn.payload)
        }

        const actualRemoteBridgeAddr = await bridgeModule.getRemoteBridge(remoteChainId)
        expect(actualRemoteBridgeAddr).toEqual(remoteBridgeAddrBytes)
    })

    test("check registered coins", async () => {
        expect(await bridgeModule.hasCoinRegistered(CoinType.USDC)).toBe(true)
        expect(await bridgeModule.hasCoinRegistered(CoinType.WETH)).toBe(true)
        const coinTypes = await bridgeModule.getCoinTypes()
        expect(coinTypes).toEqual([
            {
                account_address: bridgeDeployedAddress,
                module_name: "asset",
                struct_name: "WETH",
                type: `${bridgeDeployedAddress}::asset::WETH`,
            },
            {
                account_address: bridgeDeployedAddress,
                module_name: "asset",
                struct_name: "USDC",
                type: `${bridgeDeployedAddress}::asset::USDC`,
            },
        ])

        //example to get all remote coins of coin type
        for (const coinType of coinTypes) {
            const remoteCoins = await bridgeModule.getRemoteCoins(coinType.struct_name as BridgeCoinType)
            console.log(remoteCoins)
        }
    })

    test("set remote coin", async () => {
        const actualRemoteCoin = await bridgeModule.getRemoteCoin(CoinType.USDC, remoteChainId)
        expect(actualRemoteCoin).toEqual({
            address: remoteUSDCAddrBytes,
            tvlSD: BigInt(0),
            unwrappable: false,
        })
    })

    const amountSD = BigInt(1000000)
    let amountLD

    test("receive coin from remote chain", async () => {
        // build packet
        const aliceAddressBytes = hexToBytes(alice.address().noPrefix())
        const payload = [0]
            .concat(Array.from(remoteUSDCAddrBytes))
            .concat(Array.from(aliceAddressBytes))
            .concat(Array.from(bytesToUint8Array(new BN(amountSD.toString()).toBuffer(), 8)))
        // .concat([0, 0, 0, 0, 0, 15, 66, 64]) // same to amountSD
        console.log(`payload: ${payload}`)

        const dstAddress = Buffer.from(aptos.HexString.ensure(bridgeDeployedAddress).noPrefix(), "hex")
        const packet: Packet = {
            src_chain_id: remoteChainId,
            src_address: Buffer.from(remoteBridgeAddrBytes),
            dst_chain_id: chainId,
            dst_address: dstAddress,
            nonce: BigInt(1),
            payload: Buffer.from(payload),
        }

        // oracle submit hash
        const hash = hashPacket(packet as Packet)
        await sdk.LayerzeroModule.Uln.Receive.oraclePropose(oracleDeployAccount, hash, 30)
        const confirmations = await sdk.LayerzeroModule.Uln.Receive.getProposal(oracleDeployedAddress, hash)
        expect(confirmations).toEqual(BigInt(30))

        // relayer verify packet
        await sdk.LayerzeroModule.Uln.Receive.relayerVerify(
            relayerDeployAccount,
            dstAddress,
            encodePacket(packet),
            confirmations,
        )

        const types = await bridgeModule.getTypesFromPacket(packet)
        await sdk.LayerzeroModule.Executor.lzReceive(relayerDeployAccount, types, packet)

        // check tvl and balance
        const actualRemoteCoin = await bridgeModule.getRemoteCoin(CoinType.USDC, remoteChainId)
        expect(actualRemoteCoin.tvlSD).toEqual(amountSD)

        const balance = await coinModule.balance(CoinType.USDC, aliceAddress)
        expect(balance).toEqual(BigInt(0)) // balance is 0 because aliceAddress is not registered
    })

    test("claim coin", async () => {
        amountLD = await bridgeModule.convertAmountToLD(CoinType.USDC, amountSD)
        let claimableAmt = await bridgeModule.getClaimableCoin(CoinType.USDC, aliceAddress)
        expect(claimableAmt).toEqual(amountLD)

        await bridgeModule.claimCoin(alice, CoinType.USDC)
        const balance = await coinModule.balance(CoinType.USDC, aliceAddress)
        expect(balance).toEqual(amountLD)

        claimableAmt = await bridgeModule.getClaimableCoin(CoinType.USDC, aliceAddress)
        expect(claimableAmt).toEqual(BigInt(0))
    })

    test("register account and transfer coin", async () => {
        await bridgeModule.coinRegister(bob, CoinType.USDC)
        const registered = await coinModule.isAccountRegistered(CoinType.USDC, bobAddress)
        expect(registered).toBe(true)

        const amount = await bridgeModule.convertAmountToLD(CoinType.USDC, 100000)
        await coinModule.transfer(alice, CoinType.USDC, bobAddress, amount)
        const bobBalance = await coinModule.balance(CoinType.USDC, bobAddress)
        expect(bobBalance).toEqual(amount)

        const aliceBalance = await coinModule.balance(CoinType.USDC, aliceAddress)
        expect(aliceBalance).toEqual(amountLD - amount)
    })

    test("send coin to remote chain", async () => {
        const adapterParams = sdk.LayerzeroModule.Executor.buildDefaultAdapterParams(100000) //minDstGas
        const option = new Uint8Array(0)
        const bobBeforeBalance = await coinModule.balance(CoinType.USDC, bobAddress)

        const fee = await sdk.LayerzeroModule.Endpoint.quoteFee(
            bridgeModule.address,
            remoteChainId,
            adapterParams,
            bridgeModule.SEND_PAYLOAD_LENGTH,
        )

        const sendingAmt = bobBeforeBalance / BigInt(2)
        try {
            await bridgeModule.sendCoin(
                bob,
                CoinType.USDC,
                remoteChainId,
                remoteReceiverBytes,
                sendingAmt,
                fee - BigInt(1),
                0,
                false,
                adapterParams,
                option,
            )
            expect(1).toBe(0)
        } catch (e) {
        }

        try {
            await bridgeModule.sendCoin(
                bob,
                CoinType.USDC,
                remoteChainId,
                convertToPaddedUint8Array("0x0000000000000000000000000000000000000000", 20),
                sendingAmt,
                fee,
                0,
                false,
                adapterParams,
                option,
            )
            expect(1).toBe(0)
        } catch (e) {
        }

        await bridgeModule.sendCoin(
            bob,
            CoinType.USDC,
            remoteChainId,
            remoteReceiverBytes,
            bobBeforeBalance / BigInt(2),
            fee,
            0,
            false,
            adapterParams,
            option,
        )

        // check tvl and balance
        const actualRemoteCoin = await bridgeModule.getRemoteCoin(CoinType.USDC, remoteChainId)
        expect(actualRemoteCoin.tvlSD).toEqual(
            amountSD - (await bridgeModule.convertAmountToSD(CoinType.USDC, bobBeforeBalance)) / BigInt(2),
        )

        const bobAfterBalance = await coinModule.balance(CoinType.USDC, bobAddress)
        expect(bobAfterBalance).toEqual(bobBeforeBalance / BigInt(2))

        // check rate limit
        const { limited, amount } = await bridgeModule.getLimitedAmount(CoinType.USDC)
        // console.log(`limited amt: ${amount}`)
        expect(limited).toBe(true)
        expect(BigInt(1000000000000) - (await bridgeModule.convertAmountToSD(CoinType.USDC, sendingAmt))).toEqual(
            await bridgeModule.convertAmountToSD(CoinType.USDC, amount),
        )
    })

    test("airdrop native coin", async () => {
        const balance = await coinModule.balance(CoinType.APTOS, aliceAddress)
        const amount = BigInt(1)
        const guid = fullAddress("0x1").toUint8Array()
        await sdk.LayerzeroModule.Executor.airdrop(layerzeroDeployAccount, remoteChainId, guid, aliceAddress, amount)
        const afterBalance = await coinModule.balance(CoinType.APTOS, aliceAddress)
        expect(afterBalance).toEqual(balance + amount)
    })

    test("limiter cap config", async () => {
        //note: set in wire all
        const { enabled, capSD, windowSec } = await bridgeModule.getLimitCap(CoinType.WETH)
        expect(enabled).toBe(true)
        expect(capSD).toEqual(BigInt(100000000000))
        expect(windowSec).toEqual(BigInt(3600))
    })

    test("global pause config", async () => {
        await bridgeModule.setGlobalPause(bridgeDeployAccount, true)
        expect(await bridgeModule.globalPaused()).toBe(true)

        await bridgeModule.setGlobalPause(bridgeDeployAccount, false)
        expect(await bridgeModule.globalPaused()).toBe(false)
    })
})
