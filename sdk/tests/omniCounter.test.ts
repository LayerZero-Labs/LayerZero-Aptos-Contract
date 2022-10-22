import * as aptos from "aptos"
import * as layerzero from "../src"
import { encodePacket, fullAddress, getBalance, hashPacket, rebuildPacketFromEvent } from "../src/utils"
import { Environment, Packet } from "../src/types"
import { Counter } from "../src/modules/apps/counter"
import { Oracle } from "../src/modules/apps/oracle"
import {
    deployCommon,
    deployCounter,
    deployExecutorV2,
    deployLayerzero,
    deployMsglibV1_1,
    deployMsglibV2,
    deployOracle,
    deployZro,
} from "../tasks/deploy"
import {
    configureExecutor,
    configureExecutorWithRemote,
    configureLayerzeroWithRemote,
    configureOracle,
    configureOracleWithRemote,
    configureRelayer,
    configureRelayerWithRemote,
    Transaction,
} from "../tasks/wireAll"
import { getTestConfig } from "../tasks/config/local"
import { findSecretKeyWithZeroPrefix } from "./utils"
import { FAUCET_URL, NODE_URL } from "../src/constants"
import { ChainStage } from "@layerzerolabs/core-sdk"

const env = Environment.LOCAL

describe("layerzero-aptos end-to-end test", () => {
    const majorVersion = 1,
        minorVersion = 0
    // layerzero account
    const layerzeroDeployAccount = new aptos.AptosAccount(findSecretKeyWithZeroPrefix(1))
    const layerzeroDeployedAddress = layerzeroDeployAccount.address().toString()

    // oracle account
    const validator1 = new aptos.AptosAccount(findSecretKeyWithZeroPrefix(1))
    const validator1Address = validator1.address().toString()
    const validator2 = new aptos.AptosAccount(findSecretKeyWithZeroPrefix(1))
    const validator2Address = validator2.address().toString()
    const oracleDeployAccount = new aptos.AptosAccount(findSecretKeyWithZeroPrefix(1))
    const oracleDeployedAddress = oracleDeployAccount.address().toString()
    let oracleResourceAddress
    // let oracleMultisigPubkey, oracleMultisigAddress

    // relayer account
    const relayerDeployAccount = new aptos.AptosAccount(findSecretKeyWithZeroPrefix(1))
    const relayerDeployedAddress = relayerDeployAccount.address().toString()

    // executor account
    const executorAccount = new aptos.AptosAccount(findSecretKeyWithZeroPrefix(1))
    const executorAddress = executorAccount.address().toString()

    // counter account
    const counterDeployAccount = new aptos.AptosAccount(findSecretKeyWithZeroPrefix(1))
    const counterDeployedAddress = counterDeployAccount.address().toString()

    // faucet
    const faucet = new aptos.FaucetClient(NODE_URL[env], FAUCET_URL[env])
    console.log(`node url: ${NODE_URL[env]}, faucet url: ${FAUCET_URL[env]}`)

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

    const counterModule = new Counter(sdk, counterDeployedAddress)
    const oracleModule = new Oracle(sdk, oracleDeployedAddress)

    const chainId = 20030

    // let signFuncWithMultipleSigners: MultipleSignFunc
    beforeAll(async () => {
        // ;[oracleMultisigPubkey, oracleMultisigAddress] = await generateMultisig(
        //     [validator1.signingKey.publicKey, validator2.signingKey.publicKey],
        //     2
        // )
        // signFuncWithMultipleSigners = makeSignFuncWithMultipleSigners(...[validator1, validator2])
        // await faucet.fundAccount(oracleMultisigAddress, 5000)
    })

    describe("feature tests", () => {
        test("serialize", async () => {
            // console.log(`deploy: ${JSON.stringify(layerzeroDeployAccount.toPrivateKeyObject())}`)
            // expect(counterDeployedAddress.length).toBe(66)  // some address is starts with 0

            const bytes1 = Uint8Array.from(Buffer.from(counterDeployedAddress))
            expect(bytes1.length).toBe(counterDeployedAddress.length)

            const serializer = new aptos.BCS.Serializer()
            serializer.serializeFixedBytes(Buffer.from(counterDeployedAddress))
            const bytes2 = serializer.getBytes()
            // console.log(`bytes2: ${bytes2}`)
            expect(bytes2.length).toBe(counterDeployedAddress.length)
            expect(bytes2).toEqual(bytes1)
        })

        test("hashPacket", async () => {
            const packet = {
                src_chain_id: "20030",
                src_address: Buffer.from("88a546769667f6b3d199c9c3ef92136d1f26776682c4deaf36e26d00273426bf", "hex"),
                dst_chain_id: "20030",
                dst_address: Buffer.from("88a546769667f6b3d199c9c3ef92136d1f26776682c4deaf36e26d00273426bf", "hex"),
                nonce: "1",
                payload: Buffer.from([1, 2, 3, 4]),
            }
            const hash = hashPacket(packet)
            // console.log(`hash: ${Uint8Array.from(hash)}`)
            expect(hash).toEqual("bd3544561da899f88d9ce7a0834b4b3dc82769915aaec23d9df4f57364c36e5d")
        })
    })

    describe("deploy modules", () => {
        beforeAll(async () => {
            console.log(`layerzero deploy account: ${layerzeroDeployedAddress}`)
            console.log(`oracle deploy account: ${oracleDeployedAddress}`)
            // console.log(`oracle deploy account: ${oracleMultisigAddress}`)
            console.log(`relayer deploy account: ${relayerDeployedAddress}`)
            console.log(`counter deploy account: ${counterDeployedAddress}`)

            // airdrop
            await faucet.fundAccount(validator1Address, 100000000000)
            await faucet.fundAccount(validator2Address, 100000000000)
            await faucet.fundAccount(relayerDeployedAddress, 100000000000)
            await faucet.fundAccount(executorAddress, 100000000000)

            await deployZro(Environment.LOCAL, layerzeroDeployAccount)
            await deployCommon(Environment.LOCAL, layerzeroDeployAccount)
            await deployMsglibV1_1(Environment.LOCAL, layerzeroDeployAccount)
            await deployMsglibV2(Environment.LOCAL, layerzeroDeployAccount)
            await deployExecutorV2(Environment.LOCAL, layerzeroDeployAccount)
            await deployLayerzero(Environment.LOCAL, chainId, layerzeroDeployAccount)
            await deployCounter(
                Environment.LOCAL,
                ChainStage.PLACEHOLDER_IGNORE,
                counterDeployAccount,
                layerzeroDeployedAddress,
            )
            await deployOracle(
                Environment.LOCAL,
                ChainStage.PLACEHOLDER_IGNORE,
                oracleDeployAccount,
                layerzeroDeployedAddress,
            )
            oracleResourceAddress = await oracleModule.getResourceAddress()

            const config = getTestConfig(
                chainId,
                layerzeroDeployedAddress,
                oracleDeployedAddress,
                oracleResourceAddress,
                relayerDeployedAddress,
                executorAddress,
                {
                    [validator1Address]: true,
                    [validator2Address]: true,
                },
            )

            // wire all
            const lzTxns: Transaction[] = []
            const relayerTxns: Transaction[] = await configureRelayer(sdk, chainId, config)
            const executorTxns: Transaction[] = await configureExecutor(sdk, chainId, config)
            const oracleTxns: Transaction[] = await configureOracle(sdk, chainId, config)

            lzTxns.push(...(await configureLayerzeroWithRemote(sdk, chainId, chainId, chainId, config)))
            relayerTxns.push(...(await configureRelayerWithRemote(sdk, chainId, chainId, chainId, config)))
            executorTxns.push(...(await configureExecutorWithRemote(sdk, chainId, chainId, chainId, config))) //use same wallet
            oracleTxns.push(...(await configureOracleWithRemote(sdk, chainId, chainId, chainId, config)))

            const accounts = [layerzeroDeployAccount, relayerDeployAccount, executorAccount, oracleDeployAccount]
            const txns = [lzTxns, relayerTxns, executorTxns, oracleTxns]
            await Promise.all(
                accounts.map(async (account, i) => {
                    const txn = txns[i]
                    for (const tx of txn) {
                        await sdk.sendAndConfirmTransaction(account, tx.payload)
                    }
                }),
            )

            // check layerzero
            expect(await sdk.LayerzeroModule.Uln.Config.getChainAddressSize(chainId)).toEqual(32)
            const sendVersion = await sdk.LayerzeroModule.MsgLibConfig.getDefaultSendMsgLib(chainId)
            expect(sendVersion.major).toEqual(BigInt(1))
            expect(sendVersion.minor).toEqual(0)
            const receiveVersion = await sdk.LayerzeroModule.MsgLibConfig.getDefaultReceiveMsgLib(chainId)
            expect(receiveVersion.major).toEqual(BigInt(1))
            expect(receiveVersion.minor).toEqual(0)
            expect(
                Buffer.compare(
                    await sdk.LayerzeroModule.Executor.getDefaultAdapterParams(chainId),
                    sdk.LayerzeroModule.Executor.buildDefaultAdapterParams(10000),
                ) == 0,
            ).toBe(true)

            // check executor
            {
                const fee = await sdk.LayerzeroModule.Executor.getFee(executorAddress, chainId)
                expect(fee.airdropAmtCap).toEqual(BigInt(10000000000))
                expect(fee.priceRatio).toEqual(BigInt(10000000000))
                expect(fee.gasPrice).toEqual(BigInt(1))
            }

            // check relayer
            {
                const fee = await sdk.LayerzeroModule.Uln.Signer.getFee(relayerDeployedAddress, chainId)
                expect(fee.base_fee).toEqual(BigInt(100))
                expect(fee.fee_per_byte).toEqual(BigInt(1))
            }

            // check oracle
            expect(await oracleModule.isValidator(validator1Address)).toBe(true)
            expect(await oracleModule.isValidator(validator2Address)).toBe(true)
            expect(await oracleModule.getThreshold()).toEqual(2)
            {
                const fee = await sdk.LayerzeroModule.Uln.Signer.getFee(oracleResourceAddress, chainId)
                expect(fee.base_fee).toEqual(BigInt(10))
                expect(fee.fee_per_byte).toEqual(BigInt(0))
            }
        })

        let decodedParams
        test("register ua", async () => {
            await counterModule.createCounter(counterDeployAccount, 0)
            // await displayResources(sdk.client, new aptos.HexString(layerzeroDeployedAddress))
            const typeinfo = await sdk.LayerzeroModule.Endpoint.getUATypeInfo(counterDeployedAddress)

            expect(typeinfo.account_address).toEqual(counterDeployedAddress)

            const events = await sdk.LayerzeroModule.Endpoint.getRegisterEvents(BigInt(0), 1)
            // console.log(`events: ${JSON.stringify(events)}`)
            // console.log('events', events)
            expect(events.length).toEqual(1)
        })

        describe("check arbitrary address size", () => {
            const remoteChainId = 65534
            const remoteAddress = Uint8Array.from([1, 2, 3, 4])

            beforeAll(async () => {
                //
            })

            test("check set/get address size", async () => {
                await sdk.LayerzeroModule.Uln.Config.setChainAddressSize(
                    layerzeroDeployAccount,
                    remoteChainId,
                    remoteAddress.length,
                )
            })

            test("check setRemote and getRemote for arbitrary address", async () => {
                await counterModule.setRemote(counterDeployAccount, remoteChainId, remoteAddress)
                const address = await counterModule.getRemote(remoteChainId)
                expect(address.length).toEqual(remoteAddress.length)
                expect(Buffer.from(address).toString()).toBe(Buffer.from(remoteAddress).toString())
            })

            test("check getInboundNonce and getOutboundNonce", async () => {
                const inboundNonce = await sdk.LayerzeroModule.Channel.getInboundNonce(
                    counterDeployedAddress,
                    remoteChainId,
                    remoteAddress,
                )
                expect(inboundNonce).toEqual(BigInt(0))

                const outboundNonce = await sdk.LayerzeroModule.Channel.getOutboundNonce(
                    counterDeployedAddress,
                    remoteChainId,
                    remoteAddress,
                )
                expect(outboundNonce).toEqual(BigInt(0))
            })
        })

        test("check app config and default app config", async () => {
            await counterModule.setRemote(
                counterDeployAccount,
                chainId,
                Uint8Array.from(
                    Buffer.from(aptos.HexString.ensure(fullAddress(counterDeployedAddress)).noPrefix(), "hex"),
                ),
            )

            const address = await counterModule.getRemote(chainId)
            expect(aptos.HexString.ensure(Buffer.from(address).toString("hex")).toString()).toEqual(
                fullAddress(counterDeployedAddress).toString(),
            )

            const count = await counterModule.getCount()
            expect(count).toEqual(BigInt(0))

            let config = await sdk.LayerzeroModule.Uln.Config.getAppConfig(counterDeployedAddress, chainId)
            expect(config.relayer).toEqual(relayerDeployedAddress)
            expect(config.oracle).toEqual(oracleResourceAddress)
            expect(config.inbound_confirmations).toEqual(BigInt(15))
            expect(config.outbound_confirmations).toEqual(BigInt(15))

            await counterModule.setAppConfig(
                counterDeployAccount,
                majorVersion,
                minorVersion,
                chainId,
                sdk.LayerzeroModule.Uln.Config.TYPE_ORACLE,
                aptos.BCS.bcsToBytes(aptos.TxnBuilderTypes.AccountAddress.fromHex(oracleResourceAddress)),
            )
            await counterModule.setAppConfig(
                counterDeployAccount,
                majorVersion,
                minorVersion,
                chainId,
                sdk.LayerzeroModule.Uln.Config.TYPE_INBOUND_CONFIRMATIONS,
                aptos.BCS.bcsSerializeUint64(14).reverse(),
            )
            config = await sdk.LayerzeroModule.Uln.Config.getAppConfig(counterDeployedAddress, chainId)
            expect(config.oracle).toEqual(oracleResourceAddress)
            expect(config.inbound_confirmations).toEqual(BigInt(14))
        })

        test("increment omnicounter", async () => {
            const uaGas = BigInt(1000)
            const airdropAmount = BigInt(1000)
            const adapterParams = sdk.LayerzeroModule.Executor.buildAirdropAdapterParams(
                uaGas,
                airdropAmount,
                validator1Address,
            )

            const fee = await sdk.LayerzeroModule.Endpoint.quoteFee(
                counterModule.address,
                chainId,
                adapterParams,
                counterModule.SEND_PAYLOAD_LENGTH,
            )
            const tx = await counterModule.sendToRemote(counterDeployAccount, chainId, fee, adapterParams)

            const oracleBalance = await getBalance(sdk.client, oracleResourceAddress)

            const balanceBefore = await getBalance(sdk.client, layerzeroDeployedAddress)
            await oracleModule.withdrawFee(oracleDeployAccount, layerzeroDeployedAddress, oracleBalance)
            const balanceAfter = await getBalance(sdk.client, layerzeroDeployedAddress)
            expect(balanceAfter - balanceBefore).toEqual(oracleBalance)

            expect((tx as aptos.Types.UserTransaction).events.length).toBeGreaterThanOrEqual(0)

            const requestEventType = sdk.LayerzeroModule.Executor.getShortRequestEventType()
            const requestEvent = tx["events"].filter((e) => e.type === requestEventType)[0]
            const { adapter_params, executor } = requestEvent["data"]
            expect(executor).toEqual(executorAccount.address().toShortString())

            decodedParams = sdk.LayerzeroModule.Executor.decodeAdapterParams(
                Uint8Array.from(Buffer.from(adapter_params.replace(/0x/i, ""), "hex")),
            )
            expect(decodedParams[0]).toEqual(2)
            expect(decodedParams[1]).toEqual(uaGas)
            expect(decodedParams[2]).toEqual(airdropAmount)
            expect(decodedParams[3]).toEqual(validator1Address)

            // const accountInfo = await sdk.client.getAccount(counterDeployedAddress)
            // console.log(`accountInfo: ${JSON.stringify(accountInfo)}`)
        })
        test("check outbound", async () => {
            const nonce = await sdk.LayerzeroModule.Channel.getOutboundNonce(
                counterDeployedAddress,
                chainId,
                Uint8Array.from(
                    Buffer.from(aptos.HexString.ensure(fullAddress(counterDeployedAddress)).noPrefix(), "hex"),
                ),
            )
            // console.log(`nonce: ${nonce}`)
            expect(nonce).toEqual(BigInt(1))
        })

        describe("off-chain", () => {
            let packet: Packet
            test("prepare packet", async () => {
                const events = await sdk.LayerzeroModule.Uln.PacketEvent.getOutboundEvents(BigInt(0), 1)
                console.log(`send events: ${JSON.stringify(events)}`)
                expect(events.length).toEqual(1)

                const eventCount = await sdk.LayerzeroModule.Uln.PacketEvent.getOutboundEventCount()
                expect(eventCount).toEqual(1)

                console.log(events[0])

                // pre-process packet
                packet = await rebuildPacketFromEvent(events[0], 32)
                // console.log(`packet: ${JSON.stringify(packet)}`)
            })
            test("deliver oracle hash", async () => {
                const hash = hashPacket(packet as Packet)
                // console.log(`hash: ${JSON.stringify(hash)}`)
                // console.log(`hash: ${hash.toString('hex')}`)

                const tx = await oracleModule.propose(validator1, Buffer.from(hash, "hex"), 15)
                console.log(`Oracle Propose: ${tx.hash}`)

                let submitted = await oracleModule.isSubmitted(validator1Address, hash, 15)
                expect(submitted).toEqual(true)

                submitted = await oracleModule.isSubmitted(validator2Address, hash, 15)
                expect(submitted).toEqual(false)

                await oracleModule.propose(validator2, Buffer.from(hash, "hex"), 15)
                submitted = await oracleModule.isSubmitted(validator2Address, hash, 15)
                expect(submitted).toEqual(true)
                submitted = await oracleModule.isSubmitted(oracleDeployedAddress, hash, 15)
                expect(submitted).toEqual(true)

                // const tx = await sdk.LayerzeroModule.Uln.Receive.oracleProposeMS(
                //     oracleMultisigAddress,
                //     oracleMultisigPubkey,
                //     signFuncWithMultipleSigners,
                //     Buffer.from(hash, 'hex'),
                //     15
                // )

                const confirmations = await sdk.LayerzeroModule.Uln.Receive.getProposal(oracleResourceAddress, hash)
                expect(confirmations).toBeGreaterThanOrEqual(15)
            })

            test("deliver relayer proof", async () => {
                console.log(`packet: ${JSON.stringify(packet, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`)
                const tx = await sdk.LayerzeroModule.Uln.Receive.relayerVerify(
                    relayerDeployAccount,
                    packet.dst_address,
                    encodePacket(packet),
                    15,
                )
                console.log(`Relayer Verify: ${tx.hash}`)
            })

            test("executor lzReceive and adapter params", async () => {
                const tx = await sdk.LayerzeroModule.Executor.lzReceive(relayerDeployAccount, [], packet)
                console.log(`Executor lzReceive: ${tx.hash}`)
                const uaPayloadHash = await sdk.LayerzeroModule.Channel.getPayloadHash(
                    counterDeployedAddress,
                    parseInt(packet.src_chain_id.toString()),
                    packet.src_address,
                    BigInt(packet.nonce),
                )
                expect(uaPayloadHash === "").toBeTruthy()

                const dstAddress = aptos.HexString.fromBuffer(packet.dst_address)
                const [type, uaGas, airdropAmount, airdropAddress] = decodedParams
                const balanceBefore = await getBalance(sdk.client, airdropAddress)
                const guid = fullAddress("0x1").toUint8Array()
                await sdk.LayerzeroModule.Executor.airdrop(
                    executorAccount,
                    Number(packet.src_chain_id),
                    guid,
                    airdropAddress,
                    airdropAmount,
                )
                const balanceAfter = await getBalance(sdk.client, airdropAddress)
                expect(balanceAfter - balanceBefore).toEqual(airdropAmount)
            })

            test("check inbound", async () => {
                const inboundNonce = await sdk.LayerzeroModule.Channel.getInboundNonce(
                    counterDeployedAddress,
                    chainId,
                    Uint8Array.from(
                        Buffer.from(aptos.HexString.ensure(fullAddress(counterDeployedAddress)).noPrefix(), "hex"),
                    ),
                )
                expect(inboundNonce).toEqual(BigInt(1))
            })
            test("check counter", async () => {
                const count = await counterModule.getCount()
                expect(count).toEqual(BigInt(1))
            })
        })
    })
})
